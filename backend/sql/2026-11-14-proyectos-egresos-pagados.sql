-- Nueva distinción financiera: gasto incluido en presupuesto vs. gasto pagado.
-- Idempotencia durante el arranque: finanzas-schema.service.js añade esta
-- columna solo cuando no existe; esta query se ofrece para ejecución manual.
-- Ejecutar únicamente si 'pagado' aún no existe:
ALTER TABLE egresos_fraccionamiento
 ADD COLUMN pagado TINYINT(1) NOT NULL DEFAULT 1;

-- Los egresos históricos se conservan como pagados (1).
-- El estado se puede ajustar individualmente desde el detalle del concepto.
-- No modificar 'incluido_presupuesto': es una propiedad independiente.
