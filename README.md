# Directorio de Familias del Integral

Sitio estático (HTML/CSS/JS puro, sin build) para el directorio de emprendimientos,
oficios y profesiones de la comunidad del Colegio Integral Nuevos Ayres.

## Cómo funciona

El directorio se arma a partir de una sola lista fija: el array `CONSOLIDATED_ENTRIES`
dentro de `script.js`. Ahí están las 70 familias (histórico pre-2026 + respuestas
del formulario hasta el 20/7/2026), ya con rubro normalizado y foto asignada
cuando había una disponible.

**El sitio ya no sincroniza en vivo con Google Sheets.** La planilla del
formulario quedó guardada en una cuenta corporativa del cole que no se puede
compartir como "cualquiera con el enlace", así que la sincronización automática
dejó de ser posible. El código de esa sincronización (`loadSheetData`,
`parseSheetJson`, etc.) sigue en el archivo por si en el futuro se resuelve el
acceso, pero no se usa.

### Cómo sumar una familia nueva

Cuando alguien complete el formulario (o quieras agregar/corregir/sacar una
familia a mano), hay que editar directamente el array `CONSOLIDATED_ENTRIES`
en `script.js`: copiá el bloque de una entrada existente como plantilla y
completá `negocio`, `nombre`, `sala`, `rubro`, `descripcion`, `whatsapp`,
`instagram`, `webs` y `fotos`. Si sumás una foto, guardala en la carpeta
`images/` y poné la ruta como `"images/nombre-del-archivo.jpg"` en `fotos`.
Después hay que volver a subir el `script.js` actualizado a GitHub.

### Rubros y categorías

Las categorías ("rubro") empiezan con un emoji fijo (🎨, 💼, 🍽️, 🔨, 🩺, 📚,
👗, 💻) que funciona como filtro e ícono de respaldo cuando no hay foto. Lo
que no encaja claramente en ninguna de esas categorías se agrupa bajo
**"✨ Otros"**.

## Antes de publicar: cosas para revisar

1. **Botón "Sumar mi emprendimiento"**: en `script.js`, la constante `FORM_URL`
   tiene que apuntar al Google Form real.
2. **Números de WhatsApp**: se normalizan automáticamente al formato
   `+54 9 11 XXXX-XXXX` para armar el link de `wa.me`. Si cargás un número
   nuevo con otro formato, revisá la función `normalizeWhatsapp()` en el
   script de generación (o escribilo ya normalizado directamente en el array).

## Publicar en GitHub Pages

1. Subí estos archivos y carpetas (`index.html`, `style.css`, `script.js`,
   `header.png`, la carpeta `images/`) a un repositorio de GitHub. Mantené la
   misma estructura: `images/` tiene que quedar al lado de `index.html`.
2. En el repositorio: **Settings → Pages → Source**, elegí la rama `main` y la
   carpeta `/ (root)`.
3. Guardá. GitHub te va a dar una URL del tipo
   `https://tu-usuario.github.io/nombre-repo/`.
4. Compartila con la comunidad 🎉

No hace falta ningún paso de build, backend ni variables de entorno.

## Personalización rápida

- **Colores**: están todos como variables al principio de `style.css`, en
  `:root` (`--blue`, `--orange`, etc.). Coinciden con el Design System.
- **Textos del encabezado**: en `index.html`, dentro de `<header class="hero">`.
- **Mail e Instagram del pie de página**: en `index.html`, dentro de
  `<footer class="footer">`.

## Estructura de archivos

```
index.html   → estructura de la página (incluye el modal de tarjeta ampliada)
style.css    → estilos (colores, tipografía, tarjetas, modal, responsive)
script.js    → CONSOLIDATED_ENTRIES (base de datos) + lógica de filtros,
               búsqueda, tarjetas y modal
header.png   → banner original de Familias del Integral (no recrear, usar tal cual)
images/      → fotos de los emprendimientos (históricos + 2026)
README.md    → este archivo
```
