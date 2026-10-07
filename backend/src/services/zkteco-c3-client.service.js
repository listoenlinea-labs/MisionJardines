const net = require('net');

const COMMAND = {
  CONNECT_SESSION_LESS: 0x01,
  DISCONNECT: 0x02,
  GETPARAM: 0x04,
  CONTROL: 0x05,
  DATATABLE_CFG: 0x06,
  PUTDATA: 0x07,
  GETDATA: 0x08,
  DELETEDATA: 0x09,
  CONNECT_SESSION: 0x76
};

const REPLY_OK = 0xC8;
const REPLY_ERROR = 0xC9;
const PREPARE_DATA = 0x0D;
const TRANSMIT_DATA = 0x0E;
const FREE_DATA = 0x0F;
const START = 0xAA;
const END = 0x55;
const VERSION = 0x01;

function crc16(buffer) {
  let crc = 0x0000;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
    }
  }
  return crc & 0xFFFF;
}

function toU16(value) {
  return Number(value) & 0xFFFF;
}

function constructMessage(sessionId, requestNr, command, data) {
  const payload = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data || []);
  const hasSession = sessionId !== null && sessionId !== undefined &&
    requestNr !== null && requestNr !== undefined;
  const dataLength = payload.length + (hasSession ? 4 : 0);

  const body = Buffer.alloc(4 + dataLength);
  body[0] = VERSION;
  body[1] = Number(command) & 0xFF;
  body[2] = dataLength & 0xFF;
  body[3] = (dataLength >>> 8) & 0xFF;

  let offset = 4;
  if (hasSession) {
    const sid = toU16(sessionId);
    const seq = toU16(requestNr);
    body[offset++] = sid & 0xFF;
    body[offset++] = (sid >>> 8) & 0xFF;
    body[offset++] = seq & 0xFF;
    body[offset++] = (seq >>> 8) & 0xFF;
  }
  payload.copy(body, offset);

  const checksum = crc16(body);
  return Buffer.concat([
    Buffer.from([START]),
    body,
    Buffer.from([checksum & 0xFF, (checksum >>> 8) & 0xFF, END])
  ]);
}

function parseKv(buffer) {
  const text = Buffer.from(buffer || []).toString('ascii');
  const result = {};
  const regex = /([\w~]+)=([^,\t]+)/g;
  let match;
  while ((match = regex.exec(text))) result[match[1]] = match[2];
  return result;
}

function encodeField(type, value) {
  if (type === 'i' || type === 'L') {
    let numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric < 0) numeric = 0;
    numeric = Math.trunc(numeric);
    const temp = Buffer.alloc(4);
    temp.writeUInt32LE(numeric >>> 0, 0);
    let size = 4;
    while (size > 1 && temp[size - 1] === 0) size -= 1;
    return Buffer.concat([Buffer.from([size]), temp.subarray(0, size)]);
  }
  const data = Buffer.from(String(value ?? ''), 'ascii');
  if (data.length > 255) throw new Error('Campo ZKTeco demasiado largo');
  return Buffer.concat([Buffer.from([data.length]), data]);
}

class C3Client {
  constructor({ host, port = 4370, password = '', timeoutMs = 7000 } = {}) {
    if (!host) throw new Error('Falta ZKTECO_HOST');
    this.host = host;
    this.port = Number(port || 4370);
    this.password = String(password || '');
    this.timeoutMs = Number(timeoutMs || 7000);
    this.socket = null;
    this.sessionId = 0xFEFE;
    this.requestNr = -258;
    this.sessionLess = false;
    this.info = {};
    this._tableCfg = null;
  }

  async _openSocket() {
    this.socket = new net.Socket();
    this.socket.setNoDelay(true);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Error('Tiempo de espera agotado conectando al ZKTeco'));
      }, this.timeoutMs);
      const cleanup = () => clearTimeout(timer);
      this.socket.once('error', error => {
        cleanup();
        reject(error);
      });
      this.socket.connect(this.port, this.host, () => {
        cleanup();
        resolve();
      });
    });
  }

  _destroySocket() {
    if (this.socket) {
      try { this.socket.destroy(); } catch (_) {}
      this.socket = null;
    }
  }

  async _readPacket() {
    if (!this.socket) throw new Error('Socket ZKTeco no disponible');
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      let expected = null;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('El ZKTeco no respondió a tiempo'));
      }, this.timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.socket?.off('data', onData);
        this.socket?.off('error', onError);
        this.socket?.off('close', onClose);
      };
      const onError = error => { cleanup(); reject(error); };
      const onClose = () => {
        if (!expected || buffer.length < expected) {
          cleanup();
          reject(new Error('La conexión con el ZKTeco se cerró inesperadamente'));
        }
      };
      const onData = chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        if (expected === null && buffer.length >= 5) {
          if (buffer[0] !== START) {
            cleanup();
            reject(new Error('Respuesta inválida del ZKTeco'));
            return;
          }
          const dataSize = buffer[3] + (buffer[4] << 8);
          expected = 5 + dataSize + 3;
        }
        if (expected !== null && buffer.length >= expected) {
          cleanup();
          resolve(buffer.subarray(0, expected));
        }
      };

      this.socket.on('data', onData);
      this.socket.once('error', onError);
      this.socket.once('close', onClose);
    });
  }

  _parsePacket(packet) {
    if (packet.length < 8 || packet[0] !== START || packet[packet.length - 1] !== END) {
      throw new Error('Trama inválida recibida del ZKTeco');
    }
    const dataSize = packet[3] + (packet[4] << 8);
    const expected = 5 + dataSize + 3;
    if (packet.length !== expected) throw new Error('Longitud inválida en respuesta ZKTeco');

    const checksum = crc16(packet.subarray(1, packet.length - 3));
    if (packet[packet.length - 3] !== (checksum & 0xFF) ||
        packet[packet.length - 2] !== ((checksum >>> 8) & 0xFF)) {
      throw new Error('Checksum inválido en respuesta ZKTeco');
    }

    const command = packet[2];
    const payload = packet.subarray(5, 5 + dataSize);
    if (command === REPLY_ERROR) {
      const raw = payload.length ? payload[payload.length - 1] : 0;
      const signed = raw > 127 ? raw - 256 : raw;
      if (signed === -14) throw new Error('Contraseña de comunicación ZKTeco incorrecta');
      throw new Error(`El ZKTeco rechazó el comando (error ${signed})`);
    }
    if (![REPLY_OK, PREPARE_DATA, TRANSMIT_DATA, FREE_DATA].includes(command)) {
      throw new Error(`Respuesta ZKTeco inesperada: 0x${command.toString(16)}`);
    }
    return { command, payload, protocolVersion: packet[1] };
  }

  async _rawRequest(command, data) {
    if (!this.socket) throw new Error('ZKTeco no conectado');
    const packet = constructMessage(
      this.sessionLess ? null : this.sessionId,
      this.sessionLess ? null : this.requestNr,
      command,
      data
    );
    await new Promise((resolve, reject) => {
      this.socket.write(packet, error => error ? reject(error) : resolve());
    });
    if (!this.sessionLess) this.requestNr += 1;
    return this._parsePacket(await this._readPacket());
  }

  _stripSessionPayload(response) {
    if (this.sessionLess) return response.payload;
    if (response.payload.length < 4) return Buffer.alloc(0);

    const sid = response.payload[0] + (response.payload[1] << 8);
    if (sid !== toU16(this.sessionId)) throw new Error('Sesión ZKTeco inválida');
    return response.payload.subarray(4);
  }

  async _request(command, data) {
    const response = await this._rawRequest(command, data);
    return this._stripSessionPayload(response);
  }

  async connect() {
    this.sessionId = 0xFEFE;
    this.requestNr = -258;
    this.sessionLess = false;
    await this._openSocket();

    try {
      const password = this.password ? Buffer.from(this.password, 'ascii') : Buffer.alloc(0);
      const response = await this._rawRequest(COMMAND.CONNECT_SESSION, password);
      if (response.payload.length < 4) throw new Error('El panel no devolvió una sesión');
      this.sessionId = response.payload[0] + (response.payload[1] << 8);
    } catch (sessionError) {
      this._destroySocket();
      this.sessionId = null;
      this.requestNr = -258;
      this.sessionLess = true;
      await this._openSocket();
      try {
        await this._rawRequest(
          COMMAND.CONNECT_SESSION_LESS,
          this.password ? Buffer.from(this.password, 'ascii') : Buffer.alloc(0)
        );
      } catch (fallbackError) {
        this._destroySocket();
        throw fallbackError;
      }
    }

    const params = await this.getParams([
      '~SerialNumber', 'FirmVer', 'DeviceName', 'LockCount', 'AuxInCount', 'AuxOutCount'
    ]);
    this.info = {
      serial: params['~SerialNumber'] || null,
      firmware: params.FirmVer || null,
      deviceName: params.DeviceName || 'C3-200',
      lockCount: Number(params.LockCount || 0),
      auxInCount: Number(params.AuxInCount || 0),
      auxOutCount: Number(params.AuxOutCount || 0)
    };
    return this.info;
  }

  async disconnect() {
    if (!this.socket) return;
    try { await this._request(COMMAND.DISCONNECT); } catch (_) {}
    this._destroySocket();
  }

  async getParams(names) {
    const payload = await this._request(COMMAND.GETPARAM, Buffer.from(names.join(','), 'ascii'));
    return parseKv(payload);
  }

  async controlDoor(doorNumber, durationSeconds) {
    const door = Number(doorNumber);
    const duration = Math.max(0, Math.min(255, Number(durationSeconds || 0)));
    if (!Number.isInteger(door) || door < 1) throw new Error('Puerta ZKTeco inválida');
    if (this.info.lockCount && door > this.info.lockCount) {
      throw new Error(`El C3 reporta ${this.info.lockCount} puertas; la puerta ${door} no existe`);
    }
    await this._request(COMMAND.CONTROL, Buffer.from([1, door, 1, duration, 0]));
    return { door, duration };
  }

  async getTableConfig(force = false) {
    if (this._tableCfg && !force) return this._tableCfg;
    const payload = await this._request(COMMAND.DATATABLE_CFG);
    const configs = [];
    for (const line of payload.toString('ascii').split('\n')) {
      const kv = parseKv(Buffer.from(line, 'ascii'));
      const entries = Object.entries(kv);
      if (!entries.length) continue;
      const [[name, index], ...fieldEntries] = entries;
      configs.push({
        name,
        index: Number(index),
        fields: fieldEntries.map(([fieldName, typeDef]) => ({
          name: fieldName,
          type: String(typeDef)[0],
          index: Number(String(typeDef).slice(1))
        }))
      });
    }
    this._tableCfg = configs;
    return configs;
  }

  async getData(tableName, fieldNames = null) {
    const configs = await this.getTableConfig();
    const cfg = configs.find(item => item.name.toLowerCase() === String(tableName).toLowerCase());
    if (!cfg) throw new Error(`La tabla ZKTeco '${tableName}' no está disponible`);

    const selected = fieldNames?.length
      ? cfg.fields.filter(field => fieldNames.includes(field.name))
      : cfg.fields.slice();
    selected.sort((a, b) => a.index - b.index);
    if (fieldNames?.length && selected.length !== fieldNames.length) {
      throw new Error('Algunos campos solicitados no existen en el C3');
    }

    const request = Buffer.from([
      cfg.index,
      selected.length,
      ...selected.map(field => field.index),
      0,
      0
    ]);

    const first = await this._rawRequest(COMMAND.GETDATA, request);
    let payload = this._stripSessionPayload(first);

    if (first.command === PREPARE_DATA) {
      if (payload.length !== 17) throw new Error('Respuesta PREPARE_DATA inválida del ZKTeco');
      const compressed = payload[0] !== 0;
      const dataLength = payload.readUInt32LE(1);
      const originalLength = payload.readUInt32LE(5);
      const packageLength = payload.readUInt32LE(13);

      if (compressed) {
        throw new Error('El C3 devolvió datos comprimidos y este backend aún no los soporta');
      }
      if (!dataLength || !packageLength) {
        throw new Error('El C3 devolvió metadatos de sincronización inválidos');
      }

      const chunks = [];
      let offset = 0;
      try {
        while (offset < dataLength) {
          const offsetPayload = Buffer.alloc(4);
          offsetPayload.writeUInt32LE(offset, 0);
          const response = await this._rawRequest(TRANSMIT_DATA, offsetPayload);
          if (![TRANSMIT_DATA, REPLY_OK].includes(response.command)) {
            throw new Error(`Respuesta de bloque inesperada: 0x${response.command.toString(16)}`);
          }
          const chunkPayload = this._stripSessionPayload(response);
          if (chunkPayload.length < 4) throw new Error('Bloque ZKTeco incompleto');
          const echoedOffset = chunkPayload.readUInt32LE(0);
          if (echoedOffset !== offset) {
            throw new Error(`Offset ZKTeco inválido: esperado ${offset}, recibido ${echoedOffset}`);
          }
          const chunk = chunkPayload.subarray(4);
          if (!chunk.length) throw new Error('El C3 devolvió un bloque vacío');
          chunks.push(chunk);
          offset += chunk.length;
        }
      } finally {
        try { await this._request(FREE_DATA); } catch (_) {}
      }

      payload = Buffer.concat(chunks).subarray(0, dataLength);
      if (originalLength && payload.length !== originalLength && dataLength !== originalLength) {
        throw new Error('Longitud final de datos ZKTeco inconsistente');
      }
    } else if (first.command !== REPLY_OK) {
      throw new Error(`Respuesta GETDATA inesperada: 0x${first.command.toString(16)}`);
    }

    if (!payload.length || payload[0] !== cfg.index) {
      throw new Error('El C3 devolvió una tabla inesperada');
    }

    const fieldCount = payload[1];
    const indexes = [...payload.subarray(2, 2 + fieldCount)];
    let offset = 2 + fieldCount;
    const rows = [];

    while (offset < payload.length) {
      const row = {};
      for (const fieldIndex of indexes) {
        if (offset >= payload.length) {
          throw new Error('Registro ZKTeco truncado');
        }
        const size = payload[offset++];
        if (offset + size > payload.length) {
          throw new Error('Campo ZKTeco truncado');
        }
        const raw = payload.subarray(offset, offset + size);
        offset += size;
        const field = cfg.fields.find(item => item.index === fieldIndex);
        if (!field) throw new Error(`Campo ZKTeco desconocido: ${fieldIndex}`);
        if (field.type === 'i' || field.type === 'L') {
          let value = 0;
          for (let i = 0; i < raw.length; i += 1) value += raw[i] * (2 ** (8 * i));
          row[field.name] = value;
        } else {
          row[field.name] = raw.toString('ascii').replace(/\0+$/g, '');
        }
      }
      if (Object.keys(row).length) rows.push(row);
    }
    return rows;
  }

  async _writeRecord(command, tableName, values) {
    const configs = await this.getTableConfig();
    const cfg = configs.find(item => item.name.toLowerCase() === String(tableName).toLowerCase());
    if (!cfg) throw new Error(`La tabla ZKTeco '${tableName}' no está disponible`);

    const lower = new Map(Object.entries(values || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const fields = cfg.fields
      .filter(field => lower.has(field.name.toLowerCase()))
      .sort((a, b) => a.index - b.index);
    if (!fields.length) throw new Error('No hay campos ZKTeco para actualizar');

    const encoded = fields.map(field => encodeField(field.type, lower.get(field.name.toLowerCase())));
    const payload = Buffer.concat([
      Buffer.from([cfg.index, fields.length, ...fields.map(field => field.index)]),
      ...encoded
    ]);
    await this._request(command, payload);
    return true;
  }

  // Captura PullSDK: 0x07 agrega/escribe la fila completa.
  async putRecord(tableName, values) {
    return this._writeRecord(COMMAND.PUTDATA, tableName, values);
  }

  // Captura PullSDK: 0x09 elimina por llave primaria (p.ej. userauthorize.Pin).
  async deleteRecord(tableName, keyValues) {
    return this._writeRecord(COMMAND.DELETEDATA, tableName, keyValues);
  }

  // Compatibilidad experimental: una escritura normal usa PUTDATA (0x07).
  async setRecord(tableName, values) {
    return this.putRecord(tableName, values);
  }
}

function getDirectConfig() {
  return {
    host: process.env.ZKTECO_DIRECT_HOST || process.env.ZKTECO_HOST,
    port: Number(process.env.ZKTECO_DIRECT_PORT || process.env.ZKTECO_PORT || 4370),
    password: process.env.ZKTECO_COMM_PASSWORD || '',
    timeoutMs: Number(process.env.ZKTECO_TIMEOUT_MS || 7000)
  };
}

async function withC3(callback) {
  const client = new C3Client(getDirectConfig());
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.disconnect();
  }
}

module.exports = {
  C3Client,
  getDirectConfig,
  withC3
};
