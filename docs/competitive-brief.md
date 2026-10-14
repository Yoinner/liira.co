# Investigación competitiva — Liira

Fecha inicial: 29 de septiembre de 2026. Revisión visual: 5 de octubre de 2026.

## Referencias observadas

| Marca | Oferta visible | Conversión | Fortaleza | Oportunidad para Liira |
|---|---|---|---|---|
| Mujer Eres Virtuosa · Bucaramanga | Bisutería armada a mano y personalización | Carrito, pago manual y WhatsApp | Explica bien el proceso local | Elevar la dirección editorial y simplificar el pedido personalizado |
| Xua Accesorios · Colombia | Murano, mostacilla, bronce y categorías amplias | Ecommerce tradicional | Fichas con materiales, precio y stock | Evitar catálogo saturado; curar una experiencia de marca más memorable |
| Murano Bags · Cúcuta | Bolsos tejidos perla por perla | Carrito + cierre por WhatsApp | Relato artesanal concreto y stock escaso visible | Aplicar la misma claridad a accesorios de fe y piezas versátiles |
| Jadao · Colombia | Accesorios artesanales de diseño | Ecommerce | Catálogo robusto y cobertura nacional | Reducir ruido comercial y mejorar jerarquía visual |
| Dorado Accesorios · Medellín | Miyuki, mostacilla y colecciones | Ecommerce + WhatsApp | Categorías claras y oferta amplia | Diferenciarse con personalización y simbolismo, no por volumen |
| Mila Rose · Colombia | Bisutería artesanal y mayorista | Ecommerce + contacto | SEO de categorías y propuesta comercial amplia | Ganar foco: murano, fe contemporánea y atención directa |
| Sagrado Corazón · Colombia | Rosarios de murano | Ecommerce | Intención religiosa y precio visible | Presentar la fe con un lenguaje visual contemporáneo y versátil |

Fuentes principales: https://www.mujereresvirtuosa.com/, https://xua.com.co/, https://muranobags.com/, https://www.jadao.com.co/, https://doradoaccesorios.com/, https://milarose.com.co/, https://sagradocorazon.co/productos/rosarios-ajustables/.

## Síntesis

Table stakes: precios y rebajas claros, stock honesto, categorías, fotografías amplias, personalización, cobertura nacional, políticas, WhatsApp y operación móvil.

Debilidades repetidas: tiendas visualmente genéricas, grids extensos sin relato, textos intercambiables y cierres por WhatsApp sin trazabilidad interna.

Patrones útiles: artesanía explicada con hechos, escasez visible, catálogo filtrable y continuidad entre selección web y conversación.

Tesis defendible: **devoción contemporánea bajo la luz cálida de Bucaramanga**. Marfil, vino profundo y rosa empolvado; tipografía editorial, fotografía de luz natural y detalles que evocan las facetas del murano.

Interacción distintiva: una solicitud contextual por producto o pieza personalizada que arma el mensaje, registra el contacto antes de abrir WhatsApp y alimenta el seguimiento y las ventas del panel.

Información aún por confirmar: precios y nombres comerciales de productos, tarifas y transportadora, plazos definitivos, medios de pago, garantía formal, razón social/NIT y datos de contacto diferentes de WhatsApp.

## Evolución visual — octubre de 2026

Referencias de frontera revisadas: Jewel, ORVELLE Jewellery, Maison Elowen, Aurum y Glintura en Framer Marketplace. Se observaron como patrones, no como plantillas: fotografía de producto con protagonismo, composición editorial, navegación silenciosa, colecciones curadas, detalle de pieza y continuidad entre catálogo y pedido.

### Tesis creativa

**Joya viva:** una vitrina editorial cálida donde el murano parece capturar luz y movimiento. El sistema une marfil luminoso, vino profundo, rosa mineral y pequeños destellos dorados con tipografía de alto contraste y encuadres escultóricos.

Principios:

1. Cada fotografía funciona como una vitrina, no como relleno de una cuadrícula.
2. La información comercial siempre permanece legible y cercana, incluso cuando la composición es expresiva.
3. El motivo circular del reflejo de murano conecta portada, categorías, producto, personalización y panel privado.

Se evita: estética de ecommerce genérico, exceso de tarjetas idénticas, dorado ornamental sin función, animación continua, dark mode aplicado a toda la tienda y recursos que compitan con el producto.

La interacción distintiva sigue siendo la solicitud contextual registrada antes de WhatsApp. Los pagos continúan fuera del alcance de esta revisión hasta autorización expresa.

## Reconstrucción visual — octubre de 2026

Se contrastaron tres direcciones antes de implementar:

1. **Murano en órbita:** la luz y las facetas del vidrio construyen profundidad 2.5D alrededor de fotografía real. La vitrina se siente viva sin convertir el catálogo en un canvas pesado.
2. **Gabinete devocional:** composición simétrica, nichos y marcos inspirados en relicarios contemporáneos. Potente para rosarios, pero demasiado estrecha para los cordones de moda.
3. **Hilo cromático:** una línea continua conecta colecciones y personalización. Clara y ligera, aunque menos memorable en el primer impacto.

Dirección elegida: **Murano en órbita**. Su firma es un hilo de cuentas de vidrio construido en CSS sobre una vitrina fotográfica real. El movimiento comunica refracción y composición artesanal; no es un adorno genérico. En móvil conserva el objeto con menos cuentas y, con movimiento reducido, queda completamente estático.

Reglas del sistema:

- verbos de marca: refractar, componer, acompañar;
- profundidad: capas 2.5D, nunca texto esencial dentro de canvas;
- movimiento: táctil, lento y secundario a la compra;
- imagen: luz natural cálida, cultivos consistentes y una fotografía por momento editorial;
- prueba: producto, stock, precio, personalización y operación real junto a la imagen que los respalda.

Se descartaron WebGL, Spline y una dependencia de animación para esta versión: la escena no necesita rotación libre ni simulación material y la solución HTML/CSS ofrece mejor carga, mantenimiento y accesibilidad.

## Revisión del 14 de octubre de 2026

La dirección **Murano en órbita** fue rechazada explícitamente por sentirse genérica y por no justificar su promesa de profundidad. Se retira como dirección aprobada.

Tres nuevas tesis estructurales:

1. **Hilo vivo — seleccionada:** una mesa de luz interactiva muestra tres denarios reales; color, reflejo e hilo responden para hacer tangible la personalización.
2. **Gabinete de reliquias:** archivo táctil de piezas y significados, más contemplativo pero menos inmediato para la compra.
3. **Espectro Murano:** refracción cromática y macrofotografía, visualmente potente pero con menor utilidad operativa.

`Hilo vivo` gana porque convierte la primera pantalla en una exploración real de color con fotografías propias, conserva texto y acciones semánticas, funciona sin WebGL y tiene una expresión móvil completa. El patrón reutilizable que se conserva no es esta composición: es validar contraste y singularidad en navegador antes de llamar “premium” a una dirección.
