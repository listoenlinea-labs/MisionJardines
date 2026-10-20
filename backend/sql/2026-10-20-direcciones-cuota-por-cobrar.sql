-- Misión Jardines | Ejecutar en Hostinger ANTES de desplegar el backend del PR.
-- Ejecutar UNA SOLA VEZ: si la columna ya existe, NO repetir ALTER.
-- La tabla conserva todos los pagos, saldos, TAGs y relaciones existentes.
ALTER TABLE direcciones
  ADD COLUMN cuota_por_cobrar DECIMAL(10,2) NOT NULL DEFAULT 300.00;

-- Solo una dirección física Atotonilco 752 recibirá 150.
-- Si no se encuentra EXACTAMENTE una coincidencia, no actualiza ninguna.
UPDATE direcciones d
INNER JOIN (
    SELECT casa.id
    FROM (
        SELECT MIN(id) AS id, COUNT(*) AS cantidad
        FROM direcciones
        WHERE TRIM(numero) = '752'
          AND TRIM(REGEXP_REPLACE(LOWER(COALESCE(calle_correcta,calle)),
              '^(av[.]?|avda[.]?|avenida|calle|c[.])[[:space:]]+','')) = 'atotonilco'
    ) casa
    WHERE casa.cantidad = 1
) seleccion ON seleccion.id = d.id
SET d.cuota_por_cobrar = 150.00
WHERE d.id = seleccion.id
  AND TRIM(d.numero) = '752';

-- Resultado esperado: Atotonilco 752 = 150; las demás viviendas = 300.
SELECT id, COALESCE(calle_correcta,calle) AS calle, numero, cuota_por_cobrar
FROM direcciones
WHERE cuota_por_cobrar <> 300.00
ORDER BY id;
