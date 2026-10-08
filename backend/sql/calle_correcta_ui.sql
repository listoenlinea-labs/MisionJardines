-- MIGRACIÓN MANUAL: ejecutar en MySQL antes de fusionar el PR.
-- Respaldar primero la tabla direcciones.
-- Consultar si ya existe: SHOW COLUMNS FROM u327351184_fracc_mj.direcciones LIKE 'calle_correcta';
-- NO ejecutar por segunda vez si la columna existe.
-- La columna original calle, los numeros, los IDs y los TAGs permanecen intactos.
-- NO crear UNIQUE(calle_correcta, numero): hay IDs duplicados con el mismo domicilio normalizado.

ALTER TABLE u327351184_fracc_mj.direcciones
ADD COLUMN calle_correcta VARCHAR(100)
GENERATED ALWAYS AS (
    CASE
        WHEN LOWER(TRIM(calle)) IN (
            'av. atotonilco', 'av atotonilco',
            'avenida atotonilco', 'calle atotonilco'
        ) THEN 'Atotonilco'
        WHEN LOWER(TRIM(calle)) IN (
            'av guadalajara', 'av. guadalajara',
            'avenida guadalajara', 'calle guadalajara'
        ) THEN 'Guadalajara'
        WHEN LOWER(TRIM(calle)) IN (
            'misión gardenias', 'mision gardenias',
            'calle gardenias'
        ) THEN 'Gardenias'
        WHEN LOWER(TRIM(calle)) IN (
            'misión jardines', 'mision jardines',
            'calle jardines'
        ) THEN 'Jardines'
        WHEN LOWER(TRIM(calle)) IN (
            'misión de los lirios', 'mision de los lirios',
            'misión lirios', 'mision lirios',
            'calle lirios'
        ) THEN 'Lirios'
        WHEN LOWER(TRIM(calle)) IN (
            'misión magnolias', 'mision magnolias',
            'calle magnolias'
        ) THEN 'Magnolias'
        WHEN LOWER(TRIM(calle)) IN (
            'misión rosas', 'mision rosas',
            'calle rosas'
        ) THEN 'Rosas'
        WHEN LOWER(TRIM(calle)) IN (
            'av. valle de méxico', 'av valle de méxico',
            'avenida valle de méxico', 'valle de méxico'
        ) THEN 'Valle de México'
        ELSE TRIM(calle)
    END
) STORED;

-- Comprobación: nunca borrar filas duplicadas; los identificadores deben conservarse.
SELECT
    id AS casa_id,
    calle AS calle_original,
    calle_correcta,
    numero
FROM u327351184_fracc_mj.direcciones
ORDER BY calle_correcta, CAST(numero AS UNSIGNED), id;

-- Los domicilios visuales duplicados no son un error de este cambio.
SELECT calle_correcta, numero, COUNT(*) AS registros
FROM u327351184_fracc_mj.direcciones
GROUP BY calle_correcta, numero
HAVING COUNT(*) > 1
ORDER BY calle_correcta, CAST(numero AS UNSIGNED);
