# 使用官方 Python 3.11 精简版镜像（适合生产，体积小）
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 先复制 requirements.txt 并安装依赖（利用缓存加速）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制整个项目代码
COPY . .

# 收集静态文件（生产环境必须）
RUN python manage.py collectstatic --noinput

# 暴露 8000 端口
EXPOSE 8000

# 使用 gunicorn 启动（生产推荐，比 runserver 更稳定）
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "config.wsgi:application"]