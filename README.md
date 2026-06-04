# Masim

Sistema de gestion para taller mecanico con Node.js, Express, SQLite y frontend vanilla.

## Inicio

```bash
npm install
copy .env.example .env
npm run db:init
npm run dev
```

Usuario inicial:

- Correo: `admin@masim.local`
- Contrasena: `Admin123!`

## Funciones incluidas

- Autenticacion JWT con roles `administrador` y `mecanico`.
- Clientes, vehiculos y catalogo de servicios/refacciones.
- VIN/NIV decoder con NHTSA vPIC.
- Consulta local de `open_vehicle.db` por ano, marca, modelo y version.
- Ordenes de trabajo con estados controlados.
- Adicionales posteriores a cotizacion aprobada.
- Aprobacion publica sin login por token.
- Facturacion/cierre con MXN e impuesto fijo de 16%.

## VPS

En produccion usa PM2, Nginx, Certbot y un cron diario para respaldar `data/masim.db`.
