const TIME_ZONE = 'America/Mexico_City';
const MYSQL_TIME_ZONE = '-06:00';

// Node utiliza esta zona para new Date(), fechas locales y procesos programados.
// Se define antes de cargar modelos o controladores.
process.env.TZ = TIME_ZONE;

module.exports = {
    TIME_ZONE,
    MYSQL_TIME_ZONE
};
