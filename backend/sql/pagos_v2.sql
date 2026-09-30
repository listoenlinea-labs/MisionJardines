-- Pagos v2: cuotas extraordinarias, recibos automáticos y comprobantes PDF.
-- Ejecutar UNA sola vez después de backend/sql/pagos_reportados.sql.

CREATE TABLE IF NOT EXISTS cuotas_extraordinarias (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    concepto VARCHAR(300) NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por_usuario_id BIGINT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_extraordinaria_activo (activo, creado_en),
    CONSTRAINT fk_extraordinaria_creador FOREIGN KEY (creado_por_usuario_id)
        REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_extraordinaria_monto CHECK (monto > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pagos_reportados
    ADD COLUMN tipo_pago ENUM('MANTENIMIENTO','EXTRAORDINARIO') NOT NULL DEFAULT 'MANTENIMIENTO' AFTER usuario_id,
    ADD COLUMN cuota_extraordinaria_id BIGINT UNSIGNED NULL AFTER tipo_pago,
    ADD COLUMN monto_requerido DECIMAL(12,2) NOT NULL DEFAULT 300.00 AFTER monto,
    ADD COLUMN recargo DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER monto_requerido,
    ADD COLUMN comprobante_nombre VARCHAR(255) NULL AFTER comprobante_data,
    ADD COLUMN comprobante_mime VARCHAR(100) NULL AFTER comprobante_nombre,
    ADD COLUMN recibo_folio VARCHAR(50) NULL AFTER estatus,
    ADD COLUMN recibo_pdf_url VARCHAR(500) NULL AFTER recibo_folio,
    ADD COLUMN fecha_emision_recibo DATETIME NULL AFTER recibo_pdf_url,
    ADD UNIQUE KEY uq_pago_recibo_folio (recibo_folio),
    ADD KEY idx_pago_tipo_extra (tipo_pago, cuota_extraordinaria_id),
    ADD CONSTRAINT fk_pago_extraordinaria FOREIGN KEY (cuota_extraordinaria_id)
        REFERENCES cuotas_extraordinarias(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE pagos_reportados
    DROP CHECK chk_pago_monto,
    ADD CONSTRAINT chk_pago_monto_positivo CHECK (monto > 0);
