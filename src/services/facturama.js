const DEFAULT_BASE_URL = 'https://apisandbox.facturama.mx';

function config() {
  const user = process.env.FACTURAMA_USER;
  const password = process.env.FACTURAMA_PASSWORD;
  if (!user || !password) {
    const error = new Error('Configura FACTURAMA_USER y FACTURAMA_PASSWORD');
    error.status = 400;
    throw error;
  }
  return {
    baseUrl: (process.env.FACTURAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    auth: Buffer.from(`${user}:${password}`).toString('base64')
  };
}

async function request(method, path, body) {
  const { baseUrl, auth } = config();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (error) { data = text; }
  }
  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : data?.Message || data?.message || data?.error || data?.ModelState && JSON.stringify(data.ModelState) || 'Error de Facturama';
    const error = new Error(message);
    error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.facturama = data;
    throw error;
  }
  return data;
}

function uploadCsd(payload) {
  return request('POST', '/api-lite/csds', payload);
}

function updateCsd(rfc, payload) {
  return request('PUT', `/api-lite/csds/${encodeURIComponent(rfc)}`, payload);
}

function getCsd(rfc) {
  return request('GET', `/api-lite/csds/${encodeURIComponent(rfc)}`);
}

function deleteCsd(rfc) {
  return request('DELETE', `/api-lite/csds/${encodeURIComponent(rfc)}`);
}

function createCfdi(payload) {
  return request('POST', '/api-lite/3/cfdis', payload);
}

function getCfdi(id) {
  return request('GET', `/api-lite/cfdis/${encodeURIComponent(id)}`);
}

function downloadCfdi(format, id) {
  return request('GET', `/cfdi/${encodeURIComponent(format)}/issuedLite/${encodeURIComponent(id)}`);
}

module.exports = { uploadCsd, updateCsd, getCsd, deleteCsd, createCfdi, getCfdi, downloadCfdi };
