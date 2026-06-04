const db = require('../db/masim');

function clean(value) {
  return value === undefined || value === null ? null : String(value).trim() || null;
}

function normalizeVehicle(body = {}) {
  if (!body.customer_id) throw Object.assign(new Error('Cliente requerido'), { status: 400 });
  if (!clean(body.make) || !clean(body.model)) throw Object.assign(new Error('Marca y modelo requeridos'), { status: 400 });
  return {
    customerId: body.customer_id,
    vin: clean(body.vin),
    make: clean(body.make),
    model: clean(body.model),
    year: body.year || null,
    trim: clean(body.trim),
    vehicleType: clean(body.vehicle_type),
    plates: clean(body.plates),
    mileage: body.mileage || null,
    economicNumber: clean(body.economic_number),
    openVehicleMakeId: body.open_vehicle_make_id || null,
    openVehicleModelId: body.open_vehicle_model_id || null,
    openVehicleStyleId: body.open_vehicle_style_id || null,
    nhtsaRawJson: body.nhtsa_raw_json ? JSON.stringify(body.nhtsa_raw_json) : null
  };
}

function insertVehicle(body) {
  const vehicle = normalizeVehicle(body);
  const result = db.prepare(`
    INSERT INTO vehicles (customer_id, vin, make, model, year, trim, vehicle_type, plates, mileage, economic_number,
      open_vehicle_make_id, open_vehicle_model_id, open_vehicle_style_id, nhtsa_raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vehicle.customerId,
    vehicle.vin,
    vehicle.make,
    vehicle.model,
    vehicle.year,
    vehicle.trim,
    vehicle.vehicleType,
    vehicle.plates,
    vehicle.mileage,
    vehicle.economicNumber,
    vehicle.openVehicleMakeId,
    vehicle.openVehicleModelId,
    vehicle.openVehicleStyleId,
    vehicle.nhtsaRawJson
  );
  return result.lastInsertRowid;
}

function updateVehicle(id, body) {
  const vehicle = normalizeVehicle(body);
  db.prepare(`
    UPDATE vehicles
    SET customer_id = ?, vin = ?, make = ?, model = ?, year = ?, trim = ?, vehicle_type = ?, plates = ?,
        mileage = ?, economic_number = ?, open_vehicle_make_id = ?, open_vehicle_model_id = ?,
        open_vehicle_style_id = ?, nhtsa_raw_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    vehicle.customerId,
    vehicle.vin,
    vehicle.make,
    vehicle.model,
    vehicle.year,
    vehicle.trim,
    vehicle.vehicleType,
    vehicle.plates,
    vehicle.mileage,
    vehicle.economicNumber,
    vehicle.openVehicleMakeId,
    vehicle.openVehicleModelId,
    vehicle.openVehicleStyleId,
    vehicle.nhtsaRawJson,
    id
  );
}

module.exports = { insertVehicle, updateVehicle, normalizeVehicle };
