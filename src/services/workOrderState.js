const transitions = {
  recepcion: ['cotizacion_borrador'],
  cotizacion_borrador: ['esperando_aprobacion'],
  esperando_aprobacion: ['cotizacion_borrador', 'ot_activa'],
  ot_activa: ['trabajo_finalizado'],
  trabajo_finalizado: ['cerrada'],
  cerrada: []
};

function assertTransition(from, to) {
  if (!transitions[from] || !transitions[from].includes(to)) {
    const error = new Error(`Transicion invalida de ${from} a ${to}`);
    error.status = 400;
    throw error;
  }
}

function assertEditable(status) {
  if (['esperando_aprobacion', 'ot_activa', 'trabajo_finalizado', 'cerrada'].includes(status)) {
    const error = new Error('La cotizacion aprobada o cerrada no se modifica; use adicionales');
    error.status = 400;
    throw error;
  }
}

function assertNotClosed(status) {
  if (status === 'cerrada') {
    const error = new Error('La orden cerrada es de solo lectura');
    error.status = 400;
    throw error;
  }
}

module.exports = { assertTransition, assertEditable, assertNotClosed };
