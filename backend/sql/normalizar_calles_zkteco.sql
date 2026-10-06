-- Limpieza dirigida para la vista ZKTeco / Misión Jardines.
-- Objetivo:
--   Av. Valle de México  -> conservar únicamente 3614
--   Av. Atotonilco       -> conservar únicamente 752
--   Av. Guadalajara      -> conservar únicamente 707
-- Además unifica variantes como "Atotonilco", "Av Atotonilco",
-- "Avenida Guadalajara", etc.
--
-- Ejecutar una sola vez en la base de producción después de revisar
-- el SELECT de vista previa.

SET SQL_SAFE_UPDATES = 0;
START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS casas_zk_a_eliminar;

CREATE TEMPORARY TABLE casas_zk_a_eliminar AS
SELECT id
FROM direcciones
WHERE
(
  TRIM(calle) IN ('Atotonilco','Av Atotonilco','Av. Atotonilco','Avenida Atotonilco')
  AND TRIM(numero) <> '752'
)
OR
(
  TRIM(calle) IN ('Guadalajara','Av Guadalajara','Av. Guadalajara','Avenida Guadalajara')
  AND TRIM(numero) <> '707'
)
OR
(
  TRIM(calle) IN ('Valle de México','Av Valle de México','Av. Valle de México','Avenida Valle de México')
  AND TRIM(numero) <> '3614'
);

-- VISTA PREVIA. Revisar antes de continuar si se ejecuta manualmente por bloques.
SELECT d.id,d.calle,d.numero
FROM direcciones d
JOIN casas_zk_a_eliminar x ON x.id=d.id
ORDER BY d.calle,d.numero;

-- Tablas con FK confirmada hacia direcciones.
DELETE FROM accesos_seguridad
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM condominos
WHERE direccion_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM cuotas
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM invitaciones_casa
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM pagos_reportados
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM permisos_acceso_vivienda
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM usuarios_casas
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM verificaciones_cuenta
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

-- Relaciones lógicas sin FK directa.
DELETE FROM historial_vinculos
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM vigencias_mantenimiento
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

UPDATE usuarios
SET casa_id=NULL
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

UPDATE zk_tarjetas
SET casa_id=NULL
WHERE casa_id IN (SELECT id FROM casas_zk_a_eliminar);

DELETE FROM direcciones
WHERE id IN (SELECT id FROM casas_zk_a_eliminar);

-- Normaliza el nombre de las tres viviendas que deben permanecer.
UPDATE direcciones
SET calle='Av. Atotonilco'
WHERE TRIM(calle) IN ('Atotonilco','Av Atotonilco','Av. Atotonilco','Avenida Atotonilco')
  AND TRIM(numero)='752';

UPDATE direcciones
SET calle='Av. Guadalajara'
WHERE TRIM(calle) IN ('Guadalajara','Av Guadalajara','Av. Guadalajara','Avenida Guadalajara')
  AND TRIM(numero)='707';

UPDATE direcciones
SET calle='Av. Valle de México'
WHERE TRIM(calle) IN ('Valle de México','Av Valle de México','Av. Valle de México','Avenida Valle de México')
  AND TRIM(numero)='3614';

-- Verificación final esperada: exactamente 3 filas.
SELECT id,calle,numero
FROM direcciones
WHERE TRIM(calle) IN ('Av. Atotonilco','Av. Guadalajara','Av. Valle de México')
ORDER BY calle,numero;

COMMIT;
SET SQL_SAFE_UPDATES = 1;
