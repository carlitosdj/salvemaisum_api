# ==========================================
# Stage 1: Builder - Build da aplicação
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependências do sistema necessárias
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    bash

# Copiar arquivos de dependências
COPY package.json yarn.lock ./

# Instalar dependências sem rodar postinstall scripts (evita falha do sharp)
RUN yarn install --ignore-scripts

# Copiar código fonte
COPY . .

# Build da aplicação
RUN yarn build

# Limpar devDependencies
RUN yarn install --production --ignore-scripts && \
    npm install --os=linux --libc=musl @img/sharp-linuxmusl-x64 @img/sharp-libvips-linuxmusl-x64 --no-save && \
    yarn cache clean

# ==========================================
# Stage 2: Production - Imagem final
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

# Instalar apenas dependências runtime necessárias
RUN apk add --no-cache dumb-init bash

# Criar usuário www-data (UID 33, GID 33 - padrão do Nginx/Apache)
# O grupo www-data já existe no Alpine, então só precisamos criar o usuário
RUN adduser -S -u 33 -G www-data www-data 2>/dev/null || true

# Copiar node_modules de produção do builder
COPY --from=builder --chown=www-data:www-data /app/node_modules ./node_modules

# Copiar build e arquivos necessários
COPY --from=builder --chown=www-data:www-data /app/dist ./dist
COPY --from=builder --chown=www-data:www-data /app/package.json ./

# Criar diretório para uploads (se necessário)
RUN mkdir -p /app/uploads && chown -R www-data:www-data /app/uploads

# Mudar para usuário não-root
USER www-data

# Expor porta da API
EXPOSE 3007

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3007/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usar dumb-init para gerenciar processos corretamente
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicialização
CMD ["node", "dist/src/main.js"]
