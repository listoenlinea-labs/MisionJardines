const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { obtenerDashboardOperativo } = require('./dashboard-operativo.controller');

const MESES = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const MESES_CORTOS = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

function fechaLocalISO(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function periodoDesdeOffset(baseDate, offset) {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
    return {
        anio: date.getFullYear(),
        indiceMes: date.getMonth(),
        mes: MESES[date.getMonth()],
        etiqueta: `${MESES_CORTOS[date.getMonth()]} ${date.getFullYear()}`,
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    };
}

function numero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function porcentaje(parte, total) {
    if (!total) return null;
    return Math.round((parte / total) * 1000) / 10;
}

function variacion(actual, anterior) {
    if (!anterior) return null;
    return Math.round((((actual - anterior) / anterior) * 100) * 10) / 10;
}

async function consultaSegura(nombre, sql, replacements, errores) {
    try {
        return await sequelize.query(sql, {
            replacements,
            type: QueryTypes.SELECT
        });
    } catch (error) {
        console.error(`Dashboard: error consultando ${nombre}:`, error.message);
        errores[nombre] = error.message;
        return [];
    }
}

async function obtenerDashboard(req, res) {
    // Seguridad y residentes reciben únicamente información operativa.
    // Ninguna consulta ni cifra de finanzas se ejecuta para estos roles.
    if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(req.usuario.rol)) {
        return obtenerDashboardOperativo(req, res);
    }
    const ahora = new Date();
    const hoy = fechaLocalISO(ahora);
    const actual = periodoDesdeOffset(ahora, 0);
    const anterior = periodoDesdeOffset(ahora, -1);
    const periodosSerie = Array.from({ length: Math.max(1, (actual.anio - 2026) * 12 + actual.indiceMes + 1) }, (_, index) => {
        const d = new Date(2026, index, 1);
        return periodoDesdeOffset(d, 0);
    });
    const errores = {};

    const replacementsPeriodo = {
        anioActual: actual.anio,
        mesActual: actual.mes,
        anioAnterior: anterior.anio,
        mesAnterior: anterior.mes,
        hoy
    };

    const [
        cuotaActualRows,
        cuotaAnteriorRows,
        recaudacionRows,
        egresosSerieRows,
        ingresosManualesRows,
        visitasRows,
        accesosRows,
        residentesRows,
        eventosRows,
        eventos7Rows,
        pagosActividad,
        visitasActividad,
        accesosActividad,
        residentesActividad
    ] = await Promise.all([
        consultaSegura(
            'cuotas',
            `SELECT
                COALESCE(SUM(CASE WHEN estatus_pago <> 'CANCELADO' THEN 1 ELSE 0 END), 0) AS total_consideradas,
                COALESCE(SUM(CASE WHEN estatus_pago IN ('PAGADO','CONDONADO') THEN 1 ELSE 0 END), 0) AS al_corriente,
                COALESCE(SUM(CASE WHEN estatus_pago IN ('PENDIENTE','PAGO_PARCIAL') THEN 1 ELSE 0 END), 0) AS pendientes,
                COALESCE(SUM(CASE WHEN estatus_pago <> 'CANCELADO' THEN monto_pagado ELSE 0 END), 0) AS recaudado
             FROM cuotas
             WHERE anio = :anioActual AND mes = :mesActual`,
            replacementsPeriodo,
            errores
        ),
        consultaSegura(
            'cuotas_anterior',
            `SELECT
                COALESCE(SUM(CASE WHEN estatus_pago <> 'CANCELADO' THEN 1 ELSE 0 END), 0) AS total_consideradas,
                COALESCE(SUM(CASE WHEN estatus_pago IN ('PAGADO','CONDONADO') THEN 1 ELSE 0 END), 0) AS al_corriente,
                COALESCE(SUM(CASE WHEN estatus_pago <> 'CANCELADO' THEN monto_pagado ELSE 0 END), 0) AS recaudado
             FROM cuotas
             WHERE anio = :anioAnterior AND mes = :mesAnterior`,
            replacementsPeriodo,
            errores
        ),
        consultaSegura(
            'recaudacion',
            `SELECT anio, mes,
                    COALESCE(SUM(CASE WHEN estatus_pago <> 'CANCELADO' THEN monto_pagado ELSE 0 END), 0) AS total
             FROM cuotas
             WHERE anio >= :anioDesde
             GROUP BY anio, mes`,
            { anioDesde: periodosSerie[0].anio },
            errores
        ),
        consultaSegura(
            'egresos_serie',
            `SELECT YEAR(fecha) AS anio, MONTH(fecha) AS mes_numero,
                    COALESCE(SUM(monto), 0) AS total
             FROM egresos_fraccionamiento
             WHERE fecha >= '2026-01-01' AND fecha <= :hoy
             GROUP BY YEAR(fecha), MONTH(fecha)`,
            { hoy },
            errores
        ),
        consultaSegura(
            'ingresos_manuales_serie',
            `SELECT YEAR(fecha) AS anio, MONTH(fecha) AS mes_numero, tipo,
                    COALESCE(SUM(monto), 0) AS total
             FROM ingresos_fraccionamiento
             WHERE fecha >= '2026-01-01' AND fecha <= :hoy
             GROUP BY YEAR(fecha), MONTH(fecha), tipo`,
            { hoy },
            errores
        ),
        consultaSegura(
            'visitas_programadas',
            `SELECT
                COALESCE(SUM(CASE WHEN estatus <> 'CANCELADA' THEN 1 ELSE 0 END), 0) AS total_hoy,
                COALESCE(SUM(CASE WHEN estatus = 'PROGRAMADA' THEN 1 ELSE 0 END), 0) AS programadas,
                COALESCE(SUM(CASE WHEN estatus = 'EN_CURSO' THEN 1 ELSE 0 END), 0) AS en_curso
             FROM visitas_programadas
             WHERE fecha_programada = :hoy`,
            { hoy },
            errores
        ),
        consultaSegura(
            'accesos_seguridad',
            `SELECT
                COALESCE(SUM(CASE WHEN fecha_salida IS NULL THEN 1 ELSE 0 END), 0) AS activos,
                COALESCE(SUM(CASE WHEN DATE(fecha_entrada) = :hoy THEN 1 ELSE 0 END), 0) AS entradas_hoy
             FROM accesos_seguridad`,
            { hoy },
            errores
        ),
        consultaSegura(
            'condominos',
            `SELECT
                (SELECT COUNT(*) FROM condominos WHERE activo = 1) AS residentes_activos,
                (SELECT COUNT(DISTINCT cv.vivienda_id) FROM condominos_viviendas cv INNER JOIN condominos c ON c.id = cv.condomino_id WHERE cv.activo = 1 AND c.activo = 1) AS viviendas_ocupadas,
                (SELECT COUNT(*) FROM direcciones) AS viviendas_totales`,
            {},
            errores
        ),
        consultaSegura(
            'eventos',
            `SELECT id, titulo, fecha, hora, tipo, ubicacion, descripcion
             FROM eventos
             WHERE fecha >= :hoy
             ORDER BY fecha ASC, COALESCE(hora, '23:59:59') ASC
             LIMIT 5`,
            { hoy },
            errores
        ),
        consultaSegura(
            'eventos_7_dias',
            `SELECT COUNT(*) AS total
             FROM eventos
             WHERE fecha BETWEEN :hoy AND DATE_ADD(:hoy, INTERVAL 7 DAY)`,
            { hoy },
            errores
        ),
        consultaSegura(
            'actividad_pagos',
            `SELECT
                COALESCE(c.fecha_pago, c.fecha_confirmacion, c.actualizado_en) AS fecha,
                COALESCE(d.calle_correcta, c.calle_snapshot) AS calle,
                c.numero_casa_snapshot AS numero,
                monto_pagado AS monto
             FROM cuotas c
             LEFT JOIN direcciones d ON d.id = c.casa_id
             WHERE c.monto_pagado > 0
             ORDER BY COALESCE(c.fecha_pago, c.fecha_confirmacion, c.actualizado_en) DESC
             LIMIT 4`,
            {},
            errores
        ),
        consultaSegura(
            'actividad_visitas',
            `SELECT
                COALESCE(v.fecha_entrada, v.actualizado_en, v.creado_en) AS fecha,
                d.calle_correcta AS calle, d.numero,
                v.estatus
             FROM visitas_programadas v
             INNER JOIN direcciones d ON d.id = v.casa_id
             WHERE v.estatus <> 'CANCELADA'
             ORDER BY COALESCE(v.fecha_entrada, v.actualizado_en, v.creado_en) DESC
             LIMIT 4`,
            {},
            errores
        ),
        consultaSegura(
            'actividad_accesos',
            `SELECT a.fecha_entrada AS fecha, d.calle_correcta AS calle, d.numero, a.tipo
             FROM accesos_seguridad a
             INNER JOIN direcciones d ON d.id = a.casa_id
             ORDER BY a.fecha_entrada DESC
             LIMIT 4`,
            {},
            errores
        ),
        consultaSegura(
            'actividad_residentes',
            `SELECT c.creado_en AS fecha, d.calle_correcta AS calle, d.numero
             FROM condominos c
             INNER JOIN condominos_viviendas cv ON cv.condomino_id = c.id AND cv.activo = 1
             INNER JOIN direcciones d ON d.id = cv.vivienda_id
             WHERE c.activo = 1
             ORDER BY c.creado_en DESC
             LIMIT 4`,
            {},
            errores
        )
    ]);

    const cuotaActual = cuotaActualRows[0] || {};
    const cuotaAnterior = cuotaAnteriorRows[0] || {};
    const visitas = visitasRows[0] || {};
    const accesos = accesosRows[0] || {};
    const residentes = residentesRows[0] || {};

    const cuotaTotalActual = numero(cuotaActual.total_consideradas);
    const cuotaCorrienteActual = numero(cuotaActual.al_corriente);
    const cuotaTotalAnterior = numero(cuotaAnterior.total_consideradas);
    const cuotaCorrienteAnterior = numero(cuotaAnterior.al_corriente);
    const porcentajeActual = porcentaje(cuotaCorrienteActual, cuotaTotalActual);
    const porcentajeAnterior = porcentaje(cuotaCorrienteAnterior, cuotaTotalAnterior);

    const recaudacionMap = new Map(
        recaudacionRows.map(row => {
            const indice = MESES.indexOf(String(row.mes || '').toUpperCase());
            const key = `${row.anio}-${String(indice + 1).padStart(2, '0')}`;
            return [key, numero(row.total)];
        })
    );

    const egresosMap = new Map(egresosSerieRows.map(row => [
        `${row.anio}-${String(row.mes_numero).padStart(2, '0')}`, numero(row.total)
    ]));
    const ingresoExtraMap = new Map();
    const saldoInicialMap = new Map();
    for (const row of ingresosManualesRows) {
        const key = `${row.anio}-${String(row.mes_numero).padStart(2, '0')}`;
        const target = row.tipo === 'SALDO_INICIAL' ? saldoInicialMap : ingresoExtraMap;
        target.set(key, (target.get(key) || 0) + numero(row.total));
    }
    // El saldo inicial se incorpora una sola vez en el mes registrado.
    let disponible = 0;
    const serie = periodosSerie.map(periodo => {
        const cuotas = recaudacionMap.get(periodo.key) || 0;
        const adicionales = ingresoExtraMap.get(periodo.key) || 0;
        const saldoInicial = saldoInicialMap.get(periodo.key) || 0;
        const ingresos = cuotas + adicionales + saldoInicial;
        const egresos = egresosMap.get(periodo.key) || 0;
        disponible += ingresos - egresos;
        return { anio: periodo.anio, mes: periodo.mes, etiqueta: periodo.etiqueta,
            total: ingresos, ingresos, cuotas, ingresosAdicionales: adicionales, saldoInicial,
            egresos, disponible };
    });

    const totalMes = numero(cuotaActual.recaudado);
    const totalMesAnterior = numero(cuotaAnterior.recaudado);

    const actividad = [
        ...pagosActividad.map(row => ({
            tipo: 'PAGO',
            fecha: row.fecha,
            titulo: 'Pago de cuota registrado',
            calle: row.calle || '',
            numero: row.numero || '',
            monto: numero(row.monto)
        })),
        ...visitasActividad.map(row => ({
            tipo: 'VISITA',
            fecha: row.fecha,
            titulo: row.estatus === 'EN_CURSO' ? 'Visita en curso' : 'Visita programada',
            calle: row.calle || '',
            numero: row.numero || ''
        })),
        ...accesosActividad.map(row => ({
            tipo: 'ACCESO',
            fecha: row.fecha,
            titulo: `Acceso ${String(row.tipo || '').toLowerCase()}`,
            calle: row.calle || '',
            numero: row.numero || ''
        })),
        ...residentesActividad.map(row => ({
            tipo: 'RESIDENTE',
            fecha: row.fecha,
            titulo: 'Residente incorporado al padrón',
            calle: row.calle || '',
            numero: row.numero || ''
        }))
    ]
        .filter(item => item.fecha)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 6);

    const fuentes = {
        cuotas: !errores.cuotas && !errores.recaudacion && !errores.egresos_serie && !errores.ingresos_manuales_serie,
        visitas: !errores.visitas_programadas,
        accesos: !errores.accesos_seguridad,
        residentes: !errores.condominos,
        eventos: !errores.eventos
    };

    return res.status(200).json({
        ok: true,
        generadoEn: new Date().toISOString(),
        periodo: {
            hoy,
            actual: { anio: actual.anio, mes: actual.mes, etiqueta: actual.etiqueta },
            anterior: { anio: anterior.anio, mes: anterior.mes, etiqueta: anterior.etiqueta }
        },
        kpis: {
            cuotas: {
                porcentajeAlCorriente: porcentajeActual,
                variacionPuntos: porcentajeActual !== null && porcentajeAnterior !== null
                    ? Math.round((porcentajeActual - porcentajeAnterior) * 10) / 10
                    : null,
                alCorriente: cuotaCorrienteActual,
                total: cuotaTotalActual,
                pendientes: numero(cuotaActual.pendientes)
            },
            visitas: {
                hoy: numero(visitas.total_hoy),
                programadas: numero(visitas.programadas),
                enCurso: numero(visitas.en_curso)
            },
            accesos: {
                activos: numero(accesos.activos),
                entradasHoy: numero(accesos.entradas_hoy)
            },
            residentes: {
                activos: numero(residentes.residentes_activos),
                viviendasOcupadas: numero(residentes.viviendas_ocupadas),
                viviendasTotales: numero(residentes.viviendas_totales)
            }
        },
        recaudacion: {
            totalMes,
            totalMesAnterior,
            variacionPorcentaje: variacion(totalMes, totalMesAnterior),
            serie
        },
        eventos: eventosRows,
        eventosProximos7Dias: numero(eventos7Rows[0]?.total),
        actividad,
        fuentes,
        errores: Object.keys(errores).length ? errores : undefined
    });
}

module.exports = {
    obtenerDashboard
};
