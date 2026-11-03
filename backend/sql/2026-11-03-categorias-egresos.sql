-- Solo ejecutar manualmente si la aplicación no tiene permisos ALTER en Hostinger.
-- Respaldar la tabla antes de ejecutar. No borra ni cambia registros existentes.
-- Nuevos valores CFE/SIAPA/INTERNET/SERVICIOS; antiguos LUZ/AGUA/PROYECTOS
-- permanecen para preservar trazabilidad y se muestran con nuevas etiquetas.
SHOW COLUMNS FROM egresos_fraccionamiento LIKE 'categoria';
ALTER TABLE egresos_fraccionamiento
 MODIFY COLUMN categoria ENUM(
  'LUZ','AGUA','JARDINERIA','MANTENIMIENTO',
  'CUOTA_EXTRAORDINARIA','OTROS','PROYECTOS',
  'CFE','SIAPA','INTERNET','SERVICIOS'
 ) NOT NULL;
SHOW COLUMNS FROM egresos_fraccionamiento LIKE 'categoria';
SELECT categoria,COUNT(*) AS movimientos,SUM(monto) AS total
 FROM egresos_fraccionamiento GROUP BY categoria ORDER BY categoria;
