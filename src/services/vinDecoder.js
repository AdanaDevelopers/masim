async function decodeVin(vin) {
  const cleanVin = String(vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
    const error = new Error('VIN/NIV debe tener 17 caracteres validos');
    error.status = 400;
    throw error;
  }

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(cleanVin)}?format=json`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error('No se pudo consultar NHTSA vPIC');
    error.status = 502;
    throw error;
  }

  const data = await response.json();
  const raw = data.Results && data.Results[0] ? data.Results[0] : {};
  const displacementLiters = raw.DisplacementL || raw.DisplacementCC ? raw.DisplacementL || String(Number(raw.DisplacementCC) / 1000) : null;

  return {
    vin: cleanVin,
    year: raw.ModelYear || null,
    make: raw.Make || null,
    model: raw.Model || null,
    trim: raw.Trim || raw.Series || null,
    vehicleType: raw.VehicleType || null,
    bodyClass: raw.BodyClass || null,
    engine: raw.EngineModel || null,
    engineCylinders: raw.EngineCylinders || null,
    displacementLiters,
    fuelType: raw.FuelTypePrimary || null,
    transmission: raw.TransmissionStyle || null,
    transmissionSpeed: raw.TransmissionSpeeds || null,
    driveType: raw.DriveType || null,
    doors: raw.Doors || null,
    plantCountry: raw.PlantCountry || null,
    errorCode: raw.ErrorCode || null,
    errorText: raw.ErrorText || null,
    raw
  };
}

module.exports = { decodeVin };
