# Liira.co

Sitio público y panel operativo para Liira Accesorios, construido con Next.js, TypeScript y Supabase.

## Incluye

- Home editorial, catálogo filtrable, detalle de producto, personalización, nosotros y políticas.
- Precio normal/rebajado, stock privado con avisos públicos solo por debajo de 5 y estado agotado.
- Solicitudes registradas antes de continuar a WhatsApp.
- Panel privado por usuario y contraseña para productos, categorías, imágenes, inventario, solicitudes y ventas.
- Dashboard con ventas confirmadas de los últimos tres meses.
- SEO técnico, sitemap, robots, manifest, estados vacíos y degradación segura sin Supabase.

## Configuración

1. Ejecutar `supabase/migrations/20260930010000_liira_store.sql` en el proyecto de Supabase.
2. Copiar `.env.example` a `.env.local` y completar las variables.
3. Generar una contraseña segura y guardar `ADMIN_PASSWORD_HASH` con el formato `salt:hash` usando `scrypt`.
4. Ejecutar `npm install` y `npm run dev`.

Las claves de servicio y la contraseña nunca deben usar prefijo `NEXT_PUBLIC_`.

## Calidad

```bash
npm run quality
```

## Flujo comercial

1. La persona elige un producto o describe una pieza personalizada.
2. La web registra la solicitud con estado `contacto`.
3. Se abre WhatsApp con el mensaje preparado.
4. En Admin, Liira marca la solicitud como `vendido` o `no vendido`.
5. Una venta exige el precio final y alimenta las métricas mensuales.
