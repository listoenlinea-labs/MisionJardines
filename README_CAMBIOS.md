# Migración visual de Misión Jardines

## Estructura final

```
Mision_Jardines/
├─ index.html
├─ cuotas.html
├─ mapa.html
├─ visitas.html
├─ seguridad.html
├─ calendario.html
├─ reportes.html
├─ directorio.html
└─ assets/
   ├─ css/
   │  └─ style.css
   └─ images/
      └─ logo-mision-jardines.png
```

## Cambios realizados

1. Se eliminaron todos los bloques `<style>...</style>` de los ocho HTML.
2. Todos enlazan ahora `assets/css/style.css`.
3. No se modificó el JavaScript existente.
4. El header actual se convierte en una barra lateral clara en escritorio.
5. En móvil, la barra lateral se convierte automáticamente en navegación superior horizontal.
6. Se unificaron colores, tarjetas, tablas, formularios, botones, estados y diseño adaptable.
7. Se conservaron reglas específicas del calendario, mapa, cuotas, directorio, reportes, seguridad y visitas.

## Acción pendiente

Copia tu archivo de logo existente a:

`assets/images/logo-mision-jardines.png`
