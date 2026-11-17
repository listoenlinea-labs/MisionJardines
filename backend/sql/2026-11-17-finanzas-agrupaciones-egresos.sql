-- Ejecutar solo si el usuario de MySQL Hostinger no tiene permiso ALTER.
-- El servidor también comprueba y añade esta columna automáticamente.
-- Relaciones reversibles solo para el plan mensual; nunca modifican egresos.
ALTER TABLE finanzas_planes_mensuales
 ADD COLUMN agrupaciones JSON NULL AFTER excluidos;
-- Formato JSON: [{"hijoId": 123, "padreId": 456}]
-- El hijo ya está incluido en el importe del padre: no sumar dos veces.
