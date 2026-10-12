FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app/backend
COPY backend/pyproject.toml ./
RUN python -c "import tomllib;print('\\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" > req.txt \
 && pip install --no-cache-dir -r req.txt
COPY backend/app ./app
COPY --from=web /web/dist /app/frontend/dist
ENV DM_DATABASE_URL=sqlite+aiosqlite:////data/drive_manager.db
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
