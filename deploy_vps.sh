#!/bin/bash

echo "Actualizando paquetes del sistema..."
apt update && apt upgrade -y

echo "Instalando dependencias base (Nginx, Git, SQLite)..."
apt install -y nginx git sqlite3 curl

echo "Instalando Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "Instalando PM2..."
npm install -g pm2

echo "Preparando directorio de la aplicación..."
mkdir -p /var/www
cd /var/www

if [ -d "masim" ]; then
  echo "El directorio ya existe, actualizando..."
  cd masim
  git pull origin main
else
  echo "Clonando repositorio..."
  git clone https://github.com/AdanaDevelopers/masim.git
  cd masim
fi

echo "Instalando dependencias del proyecto..."
npm install --production

echo "Configurando entorno y bases de datos..."
mkdir -p data
cp .env.example .env

# Mover open_vehicle.db si fue subido a /root/
if [ -f "/root/open_vehicle.db" ]; then
  echo "Moviendo open_vehicle.db al proyecto..."
  mv /root/open_vehicle.db /var/www/masim/
fi

echo "Inicializando base de datos local de la app..."
npm run db:init

echo "Configurando e iniciando PM2..."
# Eliminar si ya existía
pm2 delete masim 2>/dev/null || true
pm2 start src/server.js --name "masim"
pm2 save
pm2 startup | tail -n 1 > pm2_startup_cmd.sh
chmod +x pm2_startup_cmd.sh
./pm2_startup_cmd.sh

echo "Configurando Nginx..."
cat > /etc/nginx/sites-available/masim << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Habilitar el sitio
ln -sf /etc/nginx/sites-available/masim /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "Configurando tarea programada (cron) para respaldo de DB..."
# Añadir cron job diario a las 3 AM para respaldar data/masim.db
(crontab -l 2>/dev/null; echo "0 3 * * * cp /var/www/masim/data/masim.db /var/www/masim/data/masim_backup_\$(date +\%F).db") | crontab -

echo "================================================="
echo "¡Despliegue completado!"
echo "Tu aplicación debería estar disponible en: http://198.71.51.106"
echo "================================================="
