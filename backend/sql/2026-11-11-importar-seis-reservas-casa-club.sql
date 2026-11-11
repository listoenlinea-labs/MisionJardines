-- Misión Jardines: 6 solicitudes históricas con fecha POSTERIOR a 10-nov-2026.
-- Plantilla pública sin información de residentes; ejecutar una copia privada.
-- IMPORTANTÍSIMO: el Excel no acredita por sí solo una transferencia.
-- Se incorporan PENDIENTES (amarillo), pagado=0, sin recibos ni movimientos bancarios.
-- No altera mantenimiento, extraordinarias ni ZKTeco.
-- Requiere MySQL 8 / MariaDB con tablas reservas_casa_club y direcciones.
-- PREVISUALIZAR coincidencia de calles antes de continuar (consultas al final).

DROP PROCEDURE IF EXISTS importar_reservas_casa_club_nov2026;
DELIMITER $$
CREATE PROCEDURE importar_reservas_casa_club_nov2026()
BEGIN
 DECLARE sin_vivienda INT DEFAULT 0;
 DECLARE ambiguas INT DEFAULT 0;
 DECLARE existe_otro_dia INT DEFAULT 0;
 DECLARE total_vigente INT DEFAULT 0;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION
 BEGIN
  ROLLBACK;
  DROP TEMPORARY TABLE IF EXISTS _reservas_legado_nov2026;
  DROP TEMPORARY TABLE IF EXISTS _viviendas_resueltas_nov2026;
  RESIGNAL;
 END;

 DROP TEMPORARY TABLE IF EXISTS _reservas_legado_nov2026;
 CREATE TEMPORARY TABLE _reservas_legado_nov2026 (
  folio_legacy VARCHAR(60) NOT NULL PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  calle VARCHAR(100) NOT NULL,
  numero VARCHAR(20) NOT NULL,
  solicitante VARCHAR(180) NOT NULL,
  correo VARCHAR(150) NOT NULL,
  telefono VARCHAR(25) NOT NULL,
  propietario TINYINT(1) NOT NULL
 );
 -- CARGA PRIVADA: no subir nombres, correos ni teléfonos de residentes a GitHub.
 -- En una copia privada agregue los INSERT INTO _reservas_legado_nov2026 (...)
 -- VALUES (...); con datos provenientes de la hoja validada por Administración.

 -- Comparar nombre NORMALIZADO y número EXACTO con el padrón oficial.
 -- NO se adivina una casa por el nombre del solicitante o su teléfono.
 DROP TEMPORARY TABLE IF EXISTS _viviendas_resueltas_nov2026;
 CREATE TEMPORARY TABLE _viviendas_resueltas_nov2026 AS
 SELECT t.folio_legacy,t.fecha,COUNT(DISTINCT d.id) AS candidatos,MIN(d.id) AS casa_id
 FROM _reservas_legado_nov2026 t LEFT JOIN direcciones d
  ON TRIM(d.numero)=TRIM(t.numero)
  AND REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(NULLIF(d.calle_correcta,''),d.calle))),
   'misión ',''),'mision ',''),'mision ', '')
    COLLATE utf8mb4_unicode_ci =
   REPLACE(REPLACE(LOWER(TRIM(t.calle)),'misión ',''),'mision ','')
    COLLATE utf8mb4_unicode_ci
 GROUP BY t.folio_legacy,t.fecha;

 SELECT COUNT(*) INTO sin_vivienda FROM _viviendas_resueltas_nov2026 WHERE candidatos=0;
 SELECT COUNT(*) INTO ambiguas FROM _viviendas_resueltas_nov2026 WHERE candidatos>1;
 IF sin_vivienda>0 OR ambiguas>0 THEN
  SIGNAL SQLSTATE '45000'
   SET MESSAGE_TEXT='IMPORTACIÓN CANCELADA: alguna calle y número no existe o es ambiguo en direcciones. Revisa el padrón y ajusta la equivalencia; no se creó ningún registro.';
 END IF;

 -- No escribir encima de una reserva que ya ocupa cualquiera de los 6 días.
 -- Idempotente si el MISMO folio histórico ya fue insertado anteriormente.
 SELECT COUNT(*) INTO existe_otro_dia
 FROM _reservas_legado_nov2026 t
 JOIN reservas_casa_club r ON r.fecha_bloqueada=t.fecha
 WHERE r.notas IS NULL OR r.notas NOT LIKE CONCAT('%Origen hoja: ',t.folio_legacy,'%');
 IF existe_otro_dia>0 THEN
  SIGNAL SQLSTATE '45000'
   SET MESSAGE_TEXT='IMPORTACIÓN CANCELADA: alguna fecha ya está apartada por otro registro. Revisa las fechas antes de importar.';
 END IF;
 START TRANSACTION;
 INSERT INTO reservas_casa_club
 (usuario_id,casa_id,fecha,fecha_bloqueada,solicitante,telefono,correo,
  propietario,motivo,estatus,cuota_recuperacion,deposito_garantia,limpieza,
  pagado,fecha_pago,fecha_limite_pago,folio,notas,creado_en,actualizado_en)
 SELECT NULL,m.casa_id,t.fecha,t.fecha,t.solicitante,t.telefono,t.correo,
  t.propietario,'Apartado histórico importado','PENDIENTE',1000,700,300,
  0,NULL,DATE_SUB(t.fecha,INTERVAL 1 DAY),NULL,
  CONCAT('Origen hoja: ',t.folio_legacy,' | Banco: sin conciliar'),NOW(),NOW()
 FROM _reservas_legado_nov2026 t JOIN _viviendas_resueltas_nov2026 m
  ON m.folio_legacy=t.folio_legacy
 WHERE t.fecha>'2026-11-10'
  AND NOT EXISTS (
   SELECT 1 FROM reservas_casa_club r WHERE r.fecha_bloqueada=t.fecha
  );
 COMMIT;
 SELECT r.fecha,r.estatus,r.pagado,r.casa_id,r.solicitante
 FROM reservas_casa_club r JOIN _reservas_legado_nov2026 t
  ON r.fecha=t.fecha WHERE r.fecha_bloqueada=t.fecha ORDER BY r.fecha;
 DROP TEMPORARY TABLE IF EXISTS _reservas_legado_nov2026;
 DROP TEMPORARY TABLE IF EXISTS _viviendas_resueltas_nov2026;
END$$
DELIMITER ;
-- CALL importar_reservas_casa_club_nov2026(); -- usar solo en copia privada con datos ya cargados
DROP PROCEDURE IF EXISTS importar_reservas_casa_club_nov2026;

-- Para revisar la copia privada una vez importada:
-- SELECT fecha,estatus,pagado,fecha_bloqueada FROM reservas_casa_club
-- WHERE fecha > '2026-11-10' ORDER BY fecha;
