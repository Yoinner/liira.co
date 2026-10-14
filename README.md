# Liira.co

Sitio público y panel operativo para Liira Accesorios, construido con Next.js, TypeScript y Supabase.

## Incluye

- Home editorial, catálogo filtrable, detalle de producto, personalización, nosotros y políticas.
- Precio normal/rebajado, stock privado con avisos públicos solo por debajo de 5 y estado agotado.
- Solicitudes registradas antes de continuar a WhatsApp.
- Panel privado por usuario y contraseña para productos, categorías, portadas, imágenes, inventario, pipeline, clientes y analítica.
- Eliminación deliberada y auditada de productos; las categorías solo se eliminan cuando ya no contienen productos.
- Dashboard por periodo y Mission Control separado para el rol técnico.
- SEO técnico, sitemap, robots, manifest, estados vacíos y degradación segura sin Supabase.

## Configuración

1. Ejecutar `supabase/migrations/20260930010000_liira_store.sql` en el proyecto de Supabase.
2. Copiar `.env.example` a `.env.local` y completar las variables.
3. Configurar por separado `BUSINESS_ADMIN_USERNAME` / `BUSINESS_ADMIN_PASSWORD_HASH` y `TECH_ADMIN_USERNAME` / `TECH_ADMIN_PASSWORD_HASH`. Los hashes usan el formato `salt:hash` con `scrypt`.
4. Ejecutar `npm install` y `npm run dev`.

Las claves de servicio y la contraseña nunca deben usar prefijo `NEXT_PUBLIC_`.

La conexión oficial de WhatsApp está documentada en [`docs/whatsapp-cloud-api.md`](docs/whatsapp-cloud-api.md). Los enlaces manuales y su registro en CRM siguen funcionando hasta completar esa integración.

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
