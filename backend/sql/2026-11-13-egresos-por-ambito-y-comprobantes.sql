-- Ejecutar solo si las columnas aún no existen; en el arranque la API puede crearlas.
ALTER TABLE egresos_fraccionamiento
 ADD COLUMN ambito ENUM('MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB') NOT NULL DEFAULT 'MANTENIMIENTO',
 ADD COLUMN proyecto_id BIGINT UNSIGNED NULL,
 ADD COLUMN comprobante_archivo VARCHAR(100) NULL;
UPDATE egresos_fraccionamiento SET ambito='EXTRAORDINARIO'
 WHERE categoria IN ('CUOTA_EXTRAORDINARIA','PROYECTOS','PROYECTO') AND ambito='MANTENIMIENTO';
-- Los registros históricos sin proyecto_id NO se imputan arbitrariamente a un proyecto.
