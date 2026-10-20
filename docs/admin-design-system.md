# Liira Atelier · diseño del panel

El panel conserva la identidad vino/crema de Liira. Manrope es la tipografía operativa (formularios, tablas, mensajes y navegación); Cormorant Garamond se reserva para titulares de página y cifras destacadas. No se añadió ninguna dependencia visual.

## Decisiones

- Jerarquía por trabajo: título y acciones, filtros, una métrica principal, métricas secundarias y cola de atención. Las cifras se calculan con datos existentes; si la fuente no está disponible aparece `—` o un aviso, nunca un cero ficticio.
- Superficies discretas y contraste tonal, sin sombra o borde ornamental en cada bloque. Colores semánticos para atención, pago verificado y advertencia; el verde de WhatsApp se usa en el módulo de conversación, sin reemplazar la marca Liira.
- Navegación: rail oscuro con lista desplazable y cierre de sesión accesible en escritorio; menú vertical plegable en pantallas pequeñas. El contenido principal tiene scroll independiente en escritorio y scroll normal en móvil.
- WhatsApp: lectura de mensajes con ancho limitado, compositor debajo de un historial desplazable y panel contextual compacto. Las gestiones resueltas viven en el contexto del cliente; las cotizaciones de un caso no se presentan como conocimiento general.
- Pagos: se distinguen destino autorizado, pedido pendiente y fondos verificados. Aprobar un medio nunca se presenta como confirmación bancaria.
- Claro y oscuro comparten los mismos roles de superficie, tinta, línea, acento y foco en `app/liira-admin-premium.css`. Todos los controles conservan foco visible y las animaciones respetan `prefers-reduced-motion`.

## Referencias públicas consultadas

- [Refero · Dashboard UI Design Examples](https://styles.refero.design/examples/dashboard-ui-design): priorización de datos, etiquetas, filtros y estados vacíos. Adaptado con los datos propios de Liira, no con cifras de demostración.
- [Refero · Midday](https://styles.refero.design/style/3f2b79c1-d980-4380-a903-29856975fc37): superficies tranquilas y navegación lateral legible. No se copiaron su paleta ni componentes.
- [Refero · Dub](https://styles.refero.design/style/b0d80806-b724-4ed1-a1d1-074edd3c9bc9): densidad de tablas y estados de fila sin sobrecargar el panel.

## Verificación pendiente de datos reales

La vista local no contiene credenciales de Supabase y muestra estados de fuente no disponible. Las capturas locales sirven para revisar layout, navegación y responsive; antes de publicar hay que revisar conversaciones con medios, pagos configurados, permisos técnicos y tablas pobladas en un Preview aislado. No conectar un Preview visual a Supabase Production para probar formularios.
