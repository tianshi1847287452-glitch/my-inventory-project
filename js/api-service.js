/**
 * 库存管理系统 - API服务层
 * 真实对接后端API
 */
(function() {
  'use strict';

  // ==================== API配置 ====================
  const API_CONFIG = {
    baseURL: '/api',
    timeout: 30000
  };

  // ==================== Token管理 ====================
  const TokenManager = {
    getToken: () => localStorage.getItem('token'),
    setToken: (token) => localStorage.setItem('token', token),
    getRefreshToken: () => localStorage.getItem('refresh_token'),
    setRefreshToken: (token) => localStorage.setItem('refresh_token', token),
    getUserInfo: () => {
      try { return JSON.parse(localStorage.getItem('user') || '{}'); }
      catch { return {}; }
    },
    setUserInfo: (user) => localStorage.setItem('user', JSON.stringify(user)),
    clear: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    },
    isLoggedIn: () => !!localStorage.getItem('token')
  };

  // ==================== 核心请求方法 ====================
  async function request(endpoint, options = {}) {
    const url = `${API_CONFIG.baseURL}${endpoint}`;
    const token = TokenManager.getToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Token过期，尝试刷新
      if (response.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${TokenManager.getToken()}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return await retryResponse.json();
        } else {
          TokenManager.clear();
          window.location.href = '/login/';
          return { success: false, error: { message: '登录已过期' } };
        }
      }

      return await response.json();
    } catch (error) {
      console.error('API请求错误:', error);
      return { success: false, error: { message: error.message || '网络错误' } };
    }
  }

  // Token刷新状态管理（防止并发刷新）
  let isRefreshing = false;
  let refreshPromise = null;

  async function refreshToken() {
    // 如果已经在刷新中，等待现有的刷新完成
    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }
    
    const refresh = TokenManager.getRefreshToken();
    if (!refresh) return false;
    
    isRefreshing = true;
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_CONFIG.baseURL}/auth/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh })
        });
        
        if (response.ok) {
          const data = await response.json();
          TokenManager.setToken(data.access);
          // 重要：保存新的refresh token（因为后端配置了ROTATE_REFRESH_TOKENS）
          if (data.refresh) {
            TokenManager.setRefreshToken(data.refresh);
          }
          return true;
        }
      } catch (error) {
        console.error('刷新Token失败:', error);
      }
      return false;
    })();
    
    try {
      return await refreshPromise;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  }

  // ==================== 文件上传请求方法 ====================
  async function requestWithFile(endpoint, formData, method = 'PUT') {
    const url = `${API_CONFIG.baseURL}${endpoint}`;
    const token = TokenManager.getToken();
    
    // 不设置 Content-Type，让浏览器自动设置 multipart/form-data 和 boundary
    const headers = {
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    try {
      const response = await fetch(url, {
        method: method,
        headers,
        body: formData
      });

      // Token过期，尝试刷新
      if (response.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${TokenManager.getToken()}`;
          const retryResponse = await fetch(url, { method, headers, body: formData });
          return await retryResponse.json();
        } else {
          TokenManager.clear();
          window.location.href = '/login/';
          return { success: false, error: { message: '登录已过期' } };
        }
      }

      return await response.json();
    } catch (error) {
      console.error('文件上传请求错误:', error);
      return { success: false, error: { message: error.message || '网络错误' } };
    }
  }

  // ==================== API模块 ====================
  const API = {
    // 认证模块
    auth: {
      login: (username, password) => request('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }),
      register: (data) => request('/auth/register/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      logout: () => request('/auth/logout/', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: TokenManager.getRefreshToken() })
      }),
      profile: () => request('/auth/profile/'),
      updateProfile: (data) => request('/auth/profile/update/', {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
      changePassword: (data) => request('/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify(data)
      })
    },

    // 仪表盘模块
    dashboard: {
      overview: () => request('/dashboard/overview/'),
      charts: (days = 7) => request(`/dashboard/charts/?days=${days}`),
      trend: (period = 'month') => request(`/dashboard/trend/?period=${period}`),
      distribution: () => request('/dashboard/distribution/'),
      activities: (limit = 10) => request(`/dashboard/activities/?limit=${limit}`),
      lowStock: () => request('/dashboard/low-stock/')
    },

    // 库存物品模块
    items: {
      list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return request(`/inventory/items/${query ? '?' + query : ''}`);
      },
      get: (id) => request(`/inventory/items/${id}/`),
      create: (data) => request('/inventory/items/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      update: (id, data) => request(`/inventory/items/${id}/`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
      patch: (id, data) => request(`/inventory/items/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }),
      // 带图片上传的更新方法
      updateWithImage: (id, formData) => requestWithFile(`/inventory/items/${id}/`, formData, 'PATCH'),
      delete: (id) => request(`/inventory/items/${id}/`, { method: 'DELETE' }),
      lowStock: () => request('/inventory/items/low_stock/'),
      statistics: () => request('/inventory/items/statistics/')
    },

    // 类别模块
    categories: {
      list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return request(`/inventory/categories/${query ? '?' + query : ''}`);
      },
      get: (id) => request(`/inventory/categories/${id}/`),
      create: (data) => request('/inventory/categories/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      update: (id, data) => request(`/inventory/categories/${id}/`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
      delete: (id) => request(`/inventory/categories/${id}/`, { method: 'DELETE' })
    },

    // 出入库操作模块
    operations: {
      list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return request(`/operations/${query ? '?' + query : ''}`);
      },
      get: (id) => request(`/operations/${id}/`),
      inbound: (data) => request('/operations/inbound/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      outbound: (data) => request('/operations/outbound/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      transfer: (data) => request('/operations/transfer/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      statistics: (days = 7) => request(`/operations/statistics/?days=${days}`),
      recent: (limit = 10) => request(`/operations/recent/?limit=${limit}`)
    },

    // 仓库模块
    warehouses: {
      list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return request(`/warehouses/${query ? '?' + query : ''}`);
      },
      get: (id) => request(`/warehouses/${id}/`),
      create: (data) => request('/warehouses/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      update: (id, data) => request(`/warehouses/${id}/`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
      delete: (id) => request(`/warehouses/${id}/`, { method: 'DELETE' })
    },

    // 供应商模块
    suppliers: {
      list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return request(`/suppliers/${query ? '?' + query : ''}`);
      },
      get: (id) => request(`/suppliers/${id}/`),
      create: (data) => request('/suppliers/', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      update: (id, data) => request(`/suppliers/${id}/`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
      delete: (id) => request(`/suppliers/${id}/`, { method: 'DELETE' })
    }
  };


  // ==================== 页面数据加载函数 ====================

  // 通用Toast提示
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all transform ${
      type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    } text-white`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // 格式化时间
  function formatTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000 && date.getDate() === now.getDate()) {
      return `今天 ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    } else if (diff < 172800000) {
      return `昨天 ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    }
    return `${date.getMonth()+1}月${date.getDate()}日`;
  }

  // ==================== 仪表盘页面 ====================
  window.loadDashboardPage = async function() {
    // 加载概览数据
    const overviewRes = await API.dashboard.overview();
    if (overviewRes.success && overviewRes.data) {
      const d = overviewRes.data;
      // 更新统计卡片 - 需要根据实际HTML结构调整选择器
      updateStatCard('total-items', d.overview?.total_items, d.changes?.items_change);
      updateStatCard('low-stock', d.overview?.low_stock_items, d.changes?.low_stock_change);
      updateStatCard('total-value', d.overview?.total_value?.toLocaleString(), d.changes?.value_change);
      updateStatCard('turnover-rate', d.overview?.turnover_rate + '%', d.changes?.turnover_change);
    }

    // 加载最近活动
    const activitiesRes = await API.dashboard.activities(10);
    if (activitiesRes.success && activitiesRes.data) {
      renderRecentActivities(activitiesRes.data);
    }

    // 加载低库存物品
    const lowStockRes = await API.dashboard.lowStock();
    if (lowStockRes.success && lowStockRes.data) {
      renderLowStockItems(lowStockRes.data);
    }

    // 初始化图表
    initDashboardCharts();
  };

  function updateStatCard(id, value, change) {
    // 根据实际页面结构更新统计卡片
    const el = document.querySelector(`[data-stat="${id}"]`);
    if (el) {
      const valueEl = el.querySelector('.stat-value');
      const changeEl = el.querySelector('.stat-change');
      if (valueEl) valueEl.textContent = value || 0;
      if (changeEl && change !== undefined) {
        changeEl.textContent = `${change > 0 ? '+' : ''}${change}% 较上月`;
        changeEl.className = `stat-change text-sm mt-2 flex items-center ${change >= 0 ? 'text-success' : 'text-danger'}`;
      }
    }
  }

  function renderRecentActivities(activities) {
    const tbody = document.querySelector('#recent-activities tbody, .recent-activities tbody');
    if (!tbody) return;
    
    if (!activities.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-dark">暂无活动记录</td></tr>';
      return;
    }

    tbody.innerHTML = activities.map(act => `
      <tr class="border-b border-gray-light hover:bg-light/50 transition-colors">
        <td class="py-3 px-4">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
              <i class="fas fa-box text-gray-dark"></i>
            </div>
            <div>
              <div class="font-medium text-sm">${act.item_name || '-'}</div>
              <div class="text-xs text-gray-dark">${act.item_code || '-'}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-1 text-xs rounded-full ${
            act.type === 'in' ? 'bg-success/10 text-success' : 
            act.type === 'out' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
          }">${act.type_display || act.type}</span>
        </td>
        <td class="py-3 px-4 text-sm">${act.quantity || 0}</td>
        <td class="py-3 px-4 text-sm text-gray-dark">${formatTime(act.created_at)}</td>
        <td class="py-3 px-4 text-sm">${act.operator || '-'}</td>
      </tr>
    `).join('');
  }

  function renderLowStockItems(items) {
    const container = document.querySelector('#low-stock-list, .low-stock-list');
    if (!container) return;
    
    if (!items.length) {
      container.innerHTML = '<div class="text-center py-8 text-gray-dark">暂无低库存物品</div>';
      return;
    }

    container.innerHTML = items.slice(0, 5).map(item => `
      <div class="flex items-center justify-between p-3 bg-warning/5 rounded-apple-sm mb-3">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
            <i class="fas fa-box text-warning"></i>
          </div>
          <div>
            <div class="font-medium text-sm">${item.name}</div>
            <div class="text-xs text-gray-dark">库存: ${item.stock} / 最低: ${item.min_stock}</div>
          </div>
        </div>
        <button onclick="quickInbound(${item.id})" class="p-2 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `).join('');
  }


  // ==================== 物品列表页面 ====================
  window.loadItemsPage = async function(page = 1) {
    const tbody = document.getElementById('items-table-body');
    const totalSpan = document.getElementById('items-total');
    const pagination = document.getElementById('items-pagination');
    const searchInput = document.getElementById('items-search');
    const categoryFilter = document.getElementById('category-filter');
    
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-dark"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>加载中...</td></tr>';

    // 构建查询参数
    const params = { page };
    if (searchInput?.value) params.search = searchInput.value;
    if (categoryFilter?.value) params.category = categoryFilter.value;

    const response = await API.items.list(params);
    
    if (response.success) {
      const data = response.data;
      const items = data.results || data || [];
      const total = data.count || items.length;
      
      if (totalSpan) totalSpan.textContent = total;
      
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-dark">暂无数据</td></tr>';
        return;
      }

      tbody.innerHTML = items.map(item => `
        <tr class="border-b border-gray-light hover:bg-light/50 transition-colors">
          <td class="py-3 px-4">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                <i class="fas fa-box text-gray-dark"></i>
              </div>
              <div>
                <div class="font-medium">${item.name}</div>
                <div class="text-xs text-gray-dark">${item.code}</div>
              </div>
            </div>
          </td>
          <td class="py-3 px-4 text-sm">${item.category_name || '-'}</td>
          <td class="py-3 px-4">
            <span class="font-medium ${item.stock <= (item.min_stock || 0) ? 'text-danger' : ''}">${item.stock}</span>
            ${item.stock <= (item.min_stock || 0) ? '<i class="fas fa-exclamation-triangle text-warning ml-1"></i>' : ''}
          </td>
          <td class="py-3 px-4 text-sm">¥${(item.price || 0).toFixed(2)}</td>
          <td class="py-3 px-4 text-sm text-gray-dark">${item.warehouse_location || '-'}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-1 text-xs rounded-full ${
              item.status === 'normal' ? 'bg-success/10 text-success' : 
              item.status === 'low_stock' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
            }">${item.status_display || item.status || '正常'}</span>
          </td>
          <td class="py-3 px-4">
            <div class="flex space-x-2">
              <button onclick="editItem(${item.id})" class="text-primary hover:text-primary/80" title="编辑">
                <i class="fas fa-edit"></i>
              </button>
              <button onclick="deleteItem(${item.id})" class="text-danger hover:text-danger/80" title="删除">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      // 渲染分页
      if (pagination && total > 10) {
        const totalPages = Math.ceil(total / 10);
        pagination.innerHTML = Array.from({length: Math.min(totalPages, 5)}, (_, i) => i + 1)
          .map(p => `<button onclick="loadItemsPage(${p})" class="px-3 py-1 rounded ${p === page ? 'bg-primary text-white' : 'bg-white border border-gray-light hover:bg-gray-50'}">${p}</button>`)
          .join('');
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-danger">加载失败，请重试</td></tr>';
    }

    // 加载类别筛选选项
    loadCategoryOptions();
  };

  async function loadCategoryOptions() {
    const select = document.getElementById('category-filter');
    if (!select || select.options.length > 1) return;
    
    const response = await API.categories.list();
    if (response.success && response.data) {
      const categories = response.data.results || response.data || [];
      categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        select.appendChild(option);
      });
    }
  }

  window.editItem = async function(id) {
    showToast('编辑功能开发中...', 'info');
  };

  window.deleteItem = async function(id) {
    if (!confirm('确定要删除这个物品吗？')) return;
    
    const response = await API.items.delete(id);
    if (response.success) {
      showToast('删除成功', 'success');
      loadItemsPage();
    } else {
      showToast(response.error?.message || '删除失败', 'error');
    }
  };


  // ==================== 入库管理页面 ====================
  window.loadInboundPage = async function() {
    const tbody = document.getElementById('inbound-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-dark"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';

    // 加载入库记录
    const response = await API.operations.list({ operation_type: 'in' });
    
    if (response.success) {
      const data = response.data;
      const records = data.results || data || [];
      
      if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-dark">暂无入库记录</td></tr>';
        return;
      }

      tbody.innerHTML = records.map(record => `
        <tr class="border-b border-gray-light hover:bg-light/50 transition-colors">
          <td class="py-3 px-4">
            <div class="font-medium">${record.item_name || '-'}</div>
            <div class="text-xs text-gray-dark">${record.item_code || '-'}</div>
          </td>
          <td class="py-3 px-4 text-sm text-success font-medium">+${record.quantity}</td>
          <td class="py-3 px-4 text-sm">${record.supplier_name || '-'}</td>
          <td class="py-3 px-4 text-sm">${record.warehouse_location || '-'}</td>
          <td class="py-3 px-4 text-sm">${record.operator_name || '-'}</td>
          <td class="py-3 px-4 text-sm text-gray-dark">${formatTime(record.created_at)}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-danger">加载失败</td></tr>';
    }

    // 加载统计数据
    loadInboundStats();
  };

  async function loadInboundStats() {
    const response = await API.operations.statistics(30);
    if (response.success && response.data) {
      const stats = response.data;
      // 更新统计卡片（根据实际页面结构）
      const todayEl = document.querySelector('[data-stat="today-inbound"]');
      const weekEl = document.querySelector('[data-stat="week-inbound"]');
      const monthEl = document.querySelector('[data-stat="month-inbound"]');
      
      // 简单更新，实际需要根据页面结构调整
    }
  }

  // ==================== 出库管理页面 ====================
  window.loadOutboundPage = async function() {
    const tbody = document.getElementById('outbound-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-dark"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';

    const response = await API.operations.list({ operation_type: 'out' });
    
    if (response.success) {
      const data = response.data;
      const records = data.results || data || [];
      
      if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-dark">暂无出库记录</td></tr>';
        return;
      }

      tbody.innerHTML = records.map(record => `
        <tr class="border-b border-gray-light hover:bg-light/50 transition-colors">
          <td class="py-3 px-4">
            <div class="font-medium">${record.item_name || '-'}</div>
            <div class="text-xs text-gray-dark">${record.item_code || '-'}</div>
          </td>
          <td class="py-3 px-4 text-sm text-danger font-medium">-${record.quantity}</td>
          <td class="py-3 px-4 text-sm">${record.recipient || '-'}</td>
          <td class="py-3 px-4 text-sm">${record.department || '-'}</td>
          <td class="py-3 px-4 text-sm">${record.operator_name || '-'}</td>
          <td class="py-3 px-4 text-sm text-gray-dark">${formatTime(record.created_at)}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-danger">加载失败</td></tr>';
    }
  };

  // ==================== 调拨管理页面 ====================
  window.loadTransferPage = async function() {
    const tbody = document.getElementById('transfer-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-dark"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';

    const response = await API.operations.list({ operation_type: 'transfer' });
    
    if (response.success) {
      const data = response.data;
      const records = data.results || data || [];
      
      if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-dark">暂无调拨记录</td></tr>';
        return;
      }

      tbody.innerHTML = records.map(record => `
        <tr class="border-b border-gray-light hover:bg-light/50 transition-colors">
          <td class="py-3 px-4">
            <div class="font-medium">${record.item_name || '-'}</div>
            <div class="text-xs text-gray-dark">${record.item_code || '-'}</div>
          </td>
          <td class="py-3 px-4 text-sm">${record.quantity}</td>
          <td class="py-3 px-4 text-sm">${record.from_warehouse || '-'}</td>
          <td class="py-3 px-4 text-sm">${record.to_warehouse || '-'}</td>
          <td class="py-3 px-4 text-sm">${record.operator_name || '-'}</td>
          <td class="py-3 px-4 text-sm text-gray-dark">${formatTime(record.created_at)}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-danger">加载失败</td></tr>';
    }
  };


  // ==================== 仓库管理页面 ====================
  window.loadWarehousePage = async function() {
    const grid = document.getElementById('warehouse-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="col-span-3 text-center py-12"><i class="fas fa-spinner fa-spin text-3xl text-primary mb-4"></i><p class="text-gray-dark">加载中...</p></div>';

    const response = await API.warehouses.list();
    
    if (response.success) {
      const data = response.data;
      const warehouses = data.results || data || [];
      
      if (!warehouses.length) {
        grid.innerHTML = '<div class="col-span-3 text-center py-12 text-gray-dark">暂无仓库数据</div>';
        return;
      }

      grid.innerHTML = warehouses.map(wh => `
        <div class="bg-white rounded-apple p-6 shadow-apple hover:shadow-apple-hover transition-shadow">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h3 class="font-semibold text-lg">${wh.name}</h3>
              <p class="text-sm text-gray-dark mt-1">${wh.code}</p>
            </div>
            <span class="px-3 py-1 ${wh.is_active ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-dark'} text-xs rounded-full">
              ${wh.is_active ? '运营中' : '停用'}
            </span>
          </div>
          <div class="space-y-3">
            <div class="flex items-center text-sm">
              <i class="fas fa-map-marker-alt text-gray-dark w-5"></i>
              <span class="text-gray-dark">${wh.address || '-'}</span>
            </div>
            <div class="flex items-center text-sm">
              <i class="fas fa-user text-gray-dark w-5"></i>
              <span class="text-gray-dark">${wh.manager || '-'} ${wh.phone ? '- ' + wh.phone : ''}</span>
            </div>
            <div class="mt-4">
              <div class="flex justify-between text-sm mb-2">
                <span class="text-gray-dark">使用率</span>
                <span class="font-medium">${wh.usage_rate || 0}%</span>
              </div>
              <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full" style="width: ${wh.usage_rate || 0}%"></div>
              </div>
              <p class="text-xs text-gray-dark mt-1">${(wh.current_usage || 0).toLocaleString()} / ${(wh.capacity || 0).toLocaleString()}</p>
            </div>
          </div>
          <div class="flex space-x-2 mt-4 pt-4 border-t border-gray-light">
            <button onclick="editWarehouse(${wh.id})" class="flex-1 py-2 text-sm text-primary hover:bg-primary/10 rounded-apple-sm transition-colors">
              <i class="fas fa-edit mr-1"></i>编辑
            </button>
            <button onclick="deleteWarehouse(${wh.id})" class="flex-1 py-2 text-sm text-danger hover:bg-danger/10 rounded-apple-sm transition-colors">
              <i class="fas fa-trash mr-1"></i>删除
            </button>
          </div>
        </div>
      `).join('');
    } else {
      grid.innerHTML = '<div class="col-span-3 text-center py-12 text-danger">加载失败</div>';
    }
  };

  window.editWarehouse = async function(id) {
    console.log('🔧 editWarehouse 被调用, id:', id);
    try {
      // 获取仓库详情
      const response = await API.warehouses.get(id);
      console.log('🔧 仓库详情响应:', response);
      if (!response.success || !response.data) {
        showToast('获取仓库信息失败', 'error');
        return;
      }
      
      const warehouse = response.data;
      console.log('🔧 仓库数据:', warehouse);
      
      // 填充表单
      const form = document.getElementById('warehouse-form');
      if (form) {
        form.dataset.editId = id;
        document.getElementById('warehouse-name').value = warehouse.name || '';
        document.getElementById('warehouse-code').value = warehouse.code || '';
        document.getElementById('warehouse-address').value = warehouse.address || warehouse.location || '';
        document.getElementById('warehouse-manager').value = warehouse.manager || '';
        document.getElementById('warehouse-phone').value = warehouse.phone || '';
        document.getElementById('warehouse-capacity').value = warehouse.capacity || '';
        
        // 显示状态开关（仅编辑时显示）
        const statusRow = document.getElementById('warehouse-status-row');
        const statusCheckbox = document.getElementById('warehouse-is-active');
        console.log('🔧 statusRow:', statusRow, 'statusCheckbox:', statusCheckbox);
        
        if (statusRow && statusCheckbox) {
          statusRow.classList.remove('hidden');
          statusCheckbox.checked = warehouse.is_active !== false;
          console.log('🔧 设置状态开关:', warehouse.is_active);
          
          // 更新状态显示
          window.updateWarehouseStatusDisplay(statusCheckbox.checked);
          
          // 绑定状态变化事件
          statusCheckbox.onchange = function() {
            window.updateWarehouseStatusDisplay(this.checked);
          };
        } else {
          console.error('🔧 找不到状态行元素!');
        }
      }
      
      // 更新标题
      const title = document.querySelector('#warehouse-modal h3');
      if (title) title.textContent = '编辑仓库';
      
      // 打开模态框
      if (typeof ModalManager !== 'undefined') {
        ModalManager.openModal('warehouse-modal');
      } else {
        document.getElementById('warehouse-modal')?.classList.remove('hidden');
      }
    } catch (error) {
      console.error('编辑仓库失败:', error);
      showToast('编辑仓库失败: ' + error.message, 'error');
    }
  };
  
  // 更新仓库状态显示
  window.updateWarehouseStatusDisplay = function(isActive) {
    console.log('🔧 updateWarehouseStatusDisplay:', isActive);
    const statusIcon = document.getElementById('warehouse-status-icon');
    const statusText = document.getElementById('warehouse-status-text');
    const statusWarning = document.getElementById('warehouse-status-warning');
    
    if (isActive) {
      if (statusIcon) {
        statusIcon.classList.remove('text-gray-dark');
        statusIcon.classList.add('text-success');
      }
      if (statusText) statusText.textContent = '运营中';
      if (statusWarning) statusWarning.classList.add('hidden');
    } else {
      if (statusIcon) {
        statusIcon.classList.remove('text-success');
        statusIcon.classList.add('text-gray-dark');
      }
      if (statusText) statusText.textContent = '已停用';
      if (statusWarning) statusWarning.classList.remove('hidden');
    }
  };
  window.deleteWarehouse = async function(id) {
    if (!confirm('确定要删除这个仓库吗？')) return;
    const response = await API.warehouses.delete(id);
    if (response.success) {
      showToast('删除成功', 'success');
      loadWarehousePage();
    } else {
      showToast(response.error?.message || '删除失败', 'error');
    }
  };

  // ==================== 供应商管理页面 ====================
  window.loadSupplierPage = async function() {
    const tbody = document.getElementById('supplier-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-dark"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>加载中...</td></tr>';

    const response = await API.suppliers.list();
    
    if (response.success) {
      const data = response.data;
      const suppliers = data.results || data || [];
      
      if (!suppliers.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-dark">暂无供应商数据</td></tr>';
        return;
      }

      tbody.innerHTML = suppliers.map(sup => `
        <tr class="border-b border-gray-light hover:bg-light/50 transition-colors">
          <td class="py-3 px-4 font-medium">${sup.name}</td>
          <td class="py-3 px-4 text-sm text-gray-dark">${sup.code || '-'}</td>
          <td class="py-3 px-4 text-sm">${sup.contact || '-'}</td>
          <td class="py-3 px-4 text-sm">${sup.phone || '-'}</td>
          <td class="py-3 px-4 text-sm">${sup.email || '-'}</td>
          <td class="py-3 px-4 text-sm">${sup.item_count || 0}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-1 ${sup.status === 'active' ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-dark'} text-xs rounded-full">
              ${sup.status === 'active' ? '活跃' : '停用'}
            </span>
          </td>
          <td class="py-3 px-4">
            <div class="flex space-x-2">
              <button onclick="editSupplier(${sup.id})" class="text-primary hover:text-primary/80 text-sm" title="编辑">
                <i class="fas fa-edit"></i>
              </button>
              <button onclick="deleteSupplier(${sup.id})" class="text-danger hover:text-danger/80 text-sm" title="删除">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-danger">加载失败</td></tr>';
    }
  };

  window.editSupplier = function(id) { showToast('编辑功能开发中...', 'info'); };
  window.deleteSupplier = async function(id) {
    if (!confirm('确定要删除这个供应商吗？')) return;
    const response = await API.suppliers.delete(id);
    if (response.success) {
      showToast('删除成功', 'success');
      loadSupplierPage();
    } else {
      showToast(response.error?.message || '删除失败', 'error');
    }
  };


  // ==================== 报表分析页面 ====================
  window.loadReportsPage = async function() {
    // 加载统计数据
    const statsRes = await API.items.statistics();
    if (statsRes.success && statsRes.data) {
      // 更新统计卡片
    }

    // 初始化图表
    initReportsCharts();
  };

  async function initReportsCharts() {
    // 周转分析图表
    const turnoverChartDom = document.getElementById('turnover-chart');
    if (turnoverChartDom && window.echarts) {
      const trendRes = await API.dashboard.trend('month');
      const turnoverChart = echarts.init(turnoverChartDom);
      
      const labels = trendRes.success ? trendRes.data.labels : ['1月', '2月', '3月', '4月', '5月', '6月'];
      const inbound = trendRes.success ? trendRes.data.inbound : [0,0,0,0,0,0];
      
      turnoverChart.setOption({
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        tooltip: { trigger: 'axis' },
        xAxis: { 
          type: 'category', 
          data: labels,
          axisLine: { lineStyle: { color: '#E5E5EA' } },
          axisLabel: { color: '#8E8E93' }
        },
        yAxis: { 
          type: 'value',
          axisLine: { show: false },
          axisLabel: { color: '#8E8E93' },
          splitLine: { lineStyle: { color: '#F5F7FA' } }
        },
        series: [{
          name: '周转量',
          type: 'bar',
          data: inbound,
          itemStyle: { color: '#007AFF', borderRadius: [4, 4, 0, 0] }
        }]
      });
    }

    // 出入库对比图表
    const inoutChartDom = document.getElementById('inout-chart');
    if (inoutChartDom && window.echarts) {
      const trendRes = await API.dashboard.trend('month');
      const inoutChart = echarts.init(inoutChartDom);
      
      const labels = trendRes.success ? trendRes.data.labels : ['1月', '2月', '3月', '4月', '5月', '6月'];
      const inbound = trendRes.success ? trendRes.data.inbound : [0,0,0,0,0,0];
      const outbound = trendRes.success ? trendRes.data.outbound : [0,0,0,0,0,0];
      
      inoutChart.setOption({
        grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: ['入库', '出库'], bottom: 0, textStyle: { color: '#8E8E93' } },
        xAxis: { 
          type: 'category', 
          data: labels,
          axisLine: { lineStyle: { color: '#E5E5EA' } },
          axisLabel: { color: '#8E8E93' }
        },
        yAxis: { 
          type: 'value',
          axisLine: { show: false },
          axisLabel: { color: '#8E8E93' },
          splitLine: { lineStyle: { color: '#F5F7FA' } }
        },
        series: [
          { name: '入库', type: 'line', data: inbound, smooth: true, lineStyle: { color: '#34C759', width: 2 }, itemStyle: { color: '#34C759' } },
          { name: '出库', type: 'line', data: outbound, smooth: true, lineStyle: { color: '#FF3B30', width: 2 }, itemStyle: { color: '#FF3B30' } }
        ]
      });
    }
  }

  // ==================== 系统设置页面 ====================
  window.loadSettingsPage = async function() {
    const response = await API.auth.profile();
    if (response.success && response.data) {
      const user = response.data;
      // 填充表单
      const form = document.getElementById('profile-form');
      if (form) {
        form.querySelector('[name="username"]')?.setAttribute('value', user.username || '');
        form.querySelector('[name="email"]')?.setAttribute('value', user.email || '');
        form.querySelector('[name="first_name"]')?.setAttribute('value', user.first_name || '');
        form.querySelector('[name="phone"]')?.setAttribute('value', user.phone || '');
        form.querySelector('[name="department"]')?.setAttribute('value', user.department || '');
      }
    }
  };

  // ==================== 仪表盘图表初始化 ====================
  window.initDashboardCharts = async function() {
    // 库存趋势图表
    const trendChartDom = document.getElementById('inventory-trend-chart');
    if (trendChartDom && window.echarts) {
      const trendRes = await API.dashboard.trend('month');
      const inventoryTrendChart = echarts.init(trendChartDom);
      
      const labels = trendRes.success ? trendRes.data.labels : ['1月', '2月', '3月', '4月', '5月', '6月'];
      const inbound = trendRes.success ? trendRes.data.inbound : [0,0,0,0,0,0];
      const outbound = trendRes.success ? trendRes.data.outbound : [0,0,0,0,0,0];
      
      inventoryTrendChart.setOption({
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.9)', borderColor: '#E5E5EA', textStyle: { color: '#1D1D1F' } },
        legend: { data: ['入库', '出库'], bottom: 0 },
        xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#E5E5EA' } }, axisLabel: { color: '#8E8E93' } },
        yAxis: { type: 'value', axisLine: { show: false }, axisLabel: { color: '#8E8E93' }, splitLine: { lineStyle: { color: '#F5F7FA' } } },
        series: [
          { name: '入库', type: 'line', data: inbound, smooth: true, lineStyle: { width: 2, color: '#007AFF' }, itemStyle: { color: '#007AFF' },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{offset: 0, color: 'rgba(0,122,255,0.2)'}, {offset: 1, color: 'rgba(0,122,255,0)'}] } } },
          { name: '出库', type: 'line', data: outbound, smooth: true, lineStyle: { width: 2, color: '#FF3B30' }, itemStyle: { color: '#FF3B30' },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{offset: 0, color: 'rgba(255,59,48,0.2)'}, {offset: 1, color: 'rgba(255,59,48,0)'}] } } }
        ]
      });
    }

    // 类别分布图表
    const categoryChartDom = document.getElementById('category-distribution-chart');
    if (categoryChartDom && window.echarts) {
      const distRes = await API.dashboard.distribution();
      const categoryChart = echarts.init(categoryChartDom);
      
      const colors = ['#007AFF', '#5AC8FA', '#FF9500', '#34C759', '#5856D6', '#8E8E93'];
      let chartData = [];
      
      if (distRes.success && distRes.data) {
        chartData = distRes.data.labels.map((label, i) => ({
          value: distRes.data.values[i],
          name: label,
          itemStyle: { color: colors[i % colors.length] }
        }));
      }
      
      categoryChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        series: [{
          type: 'pie',
          radius: '70%',
          center: ['50%', '50%'],
          data: chartData,
          label: { show: false },
          emphasis: { scale: true, itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.1)' } }
        }]
      });
    }
  };


  // ==================== 快捷操作 ====================
  window.quickInbound = async function(itemId) {
    const quantity = prompt('请输入入库数量:');
    if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) {
      showToast('请输入有效的数量', 'error');
      return;
    }
    
    const response = await API.operations.inbound({
      item: itemId,
      quantity: parseInt(quantity),
      remark: '快捷入库'
    });
    
    if (response.success) {
      showToast('入库成功', 'success');
      // 刷新当前页面数据
      if (typeof loadDashboardPage === 'function') loadDashboardPage();
    } else {
      showToast(response.error?.message || '入库失败', 'error');
    }
  };

  // ==================== 登录检查 ====================
  function checkAuth() {
    const publicPages = ['/login/', '/login', '/register/', '/register'];
    const currentPath = window.location.pathname;
    
    if (!publicPages.includes(currentPath) && !TokenManager.isLoggedIn()) {
      window.location.href = '/login/';
      return false;
    }
    return true;
  }

  // ==================== 页面初始化 ====================
  document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    if (!checkAuth()) return;

    // 根据页面自动加载数据
    const path = window.location.pathname;
    
    if (path === '/' || path === '/index.html' || path.includes('dashboard')) {
      if (typeof loadDashboardPage === 'function') loadDashboardPage();
    } else if (path.includes('items')) {
      if (typeof loadItemsPage === 'function') loadItemsPage();
    } else if (path.includes('inbound')) {
      if (typeof loadInboundPage === 'function') loadInboundPage();
    } else if (path.includes('outbound')) {
      if (typeof loadOutboundPage === 'function') loadOutboundPage();
    } else if (path.includes('transfer')) {
      if (typeof loadTransferPage === 'function') loadTransferPage();
    } else if (path.includes('warehouse')) {
      if (typeof loadWarehousePage === 'function') loadWarehousePage();
    } else if (path.includes('supplier')) {
      if (typeof loadSupplierPage === 'function') loadSupplierPage();
    } else if (path.includes('reports')) {
      if (typeof loadReportsPage === 'function') loadReportsPage();
    } else if (path.includes('settings')) {
      if (typeof loadSettingsPage === 'function') loadSettingsPage();
    }

    // 绑定搜索事件
    const searchInput = document.getElementById('items-search');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadItemsPage(1), 500);
      });
    }

    // 绑定筛选事件
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => loadItemsPage(1));
    }

    // 更新用户信息显示
    updateUserDisplay();
  });

  function updateUserDisplay() {
    const user = TokenManager.getUserInfo();
    if (user && user.first_name) {
      const userInitials = document.querySelectorAll('.user-initials');
      userInitials.forEach(el => {
        el.textContent = (user.first_name || 'U').charAt(0).toUpperCase();
      });
    }
  }

  // ==================== 暴露到全局 ====================
  // 将TokenManager添加到API对象中，以便app.js可以通过API.TokenManager访问
  API.TokenManager = TokenManager;
  
  window.API = API;
  window.TokenManager = TokenManager;
  window.showToast = showToast;

  console.log('✅ API服务已初始化 - 真实API对接版本');
})();
