/**
 * Vehicle Description Parser
 *
 * Intelligently parses vehicle descriptions to extract:
 * - Manufacturer (cleaned)
 * - Model
 * - Variant
 */

/**
 * Parse vehicle description that contains manufacturer prefix
 * @param {string} manufacturer - The manufacturer name
 * @param {string} vehicleDescription - Full vehicle description (may include manufacturer prefix)
 * @returns {object} { manufacturer, model, variant }
 */
function parseVehicleDescription(manufacturer, vehicleDescription) {
  if (!vehicleDescription) {
    return { manufacturer, model: '', variant: '' }
  }

  // Normalize strings
  const mfr = (manufacturer || '').trim()
  let description = vehicleDescription.trim()

  // Remove manufacturer prefix if it exists at the start
  const mfrPattern = new RegExp(`^${escapeRegex(mfr)}\\s+`, 'i')
  description = description.replace(mfrPattern, '')

  // Common model patterns for different manufacturers
  const modelPatterns = {
    // Audi: "A1 5 Door Sportback", "A3 Sportback", "Q5 SUV"
    'audi': /^([AQ]\d+(?:\s+e-tron)?(?:\s+\d+\s+Door)?(?:\s+Sportback|Saloon|Avant|SUV)?)/i,

    // BMW: "3 Series", "X5", "i4"
    'bmw': /^(\d+\s+Series|[XZi]\d+(?:\s+M)?)/i,

    // Mercedes: "A-Class", "C-Class", "GLC"
    'mercedes': /^([A-Z]{1,3}(?:-Class)?(?:\s+Coupe|Saloon|Estate)?)/i,
    'mercedes-benz': /^([A-Z]{1,3}(?:-Class)?(?:\s+Coupe|Saloon|Estate)?)/i,

    // Alfa Romeo: "Giulia", "Stelvio", "Tonale Hatch 5 Door"
    'alfa romeo': /^(Giulia|Stelvio|Tonale(?:\s+Hat(?:ch)?(?:\s+\d+DR)?)?)/i,

    // Ford: "Transit Custom", "Fiesta", "Ranger"
    'ford': /^(Transit(?:\s+Custom)?|Fiesta|Focus|Ranger|Mustang|Puma|Kuga)/i,

    // Volkswagen: "Golf", "Polo", "Transporter"
    'volkswagen': /^(Golf|Polo|Tiguan|Transporter|Caddy|Passat)/i,

    // Generic fallback: First 1-3 words that look like a model
    'default': /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z0-9][A-Za-z0-9-]*){0,2})/
  }

  // Get the appropriate pattern
  const mfrLower = mfr.toLowerCase()
  const pattern = modelPatterns[mfrLower] || modelPatterns['default']

  // Extract model
  const match = description.match(pattern)
  let model = ''
  let variant = ''

  if (match) {
    model = match[1].trim()
    // Everything after the model is the variant
    variant = description.substring(match[1].length).trim()
  } else {
    // Fallback: First word is model, rest is variant
    const parts = description.split(/\s+/)
    model = parts[0] || ''
    variant = parts.slice(1).join(' ')
  }

  // Clean up variant - remove common abbreviated patterns
  variant = cleanVariant(variant)

  return {
    manufacturer: mfr,
    model: model,
    variant: variant
  }
}

/**
 * Clean up variant string by expanding common abbreviations
 */
function cleanVariant(variant) {
  if (!variant) return ''

  const replacements = {
    // Common abbreviations
    'Sptbk': 'Sportback',
    'Hat': 'Hatch',
    'DR': 'Door',
    'B/Ed': 'Black Edition',
    'Bk/Ed': 'Black Edition',
    'T/Pr': 'Tech Pro',
    'Tcpk': 'Tech Pack',
    'S trc': 'S tronic',
    'Trbt Itl': 'Tributo Italiano',
    'Intsa': 'Intensa',
    'AU': 'Auto',
    'Q4': 'Q4',
    'AWD': 'AWD',
    'Phev': 'PHEV',

    // Spacing fixes
    '5DR': '5 Door',
    '4DR': '4 Door',
    '3DR': '3 Door',
  }

  let cleaned = variant

  // Apply replacements
  Object.entries(replacements).forEach(([abbrev, full]) => {
    const regex = new RegExp(`\\b${escapeRegex(abbrev)}\\b`, 'gi')
    cleaned = cleaned.replace(regex, full)
  })

  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

/**
 * Escape special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Batch process multiple vehicle records
 */
function parseVehicleBatch(vehicles) {
  return vehicles.map(vehicle => {
    const parsed = parseVehicleDescription(vehicle.manufacturer, vehicle.vehicleDescription)
    return {
      ...vehicle,
      manufacturer: parsed.manufacturer,
      model: parsed.model,
      variant: parsed.variant
    }
  })
}

module.exports = {
  parseVehicleDescription,
  parseVehicleBatch,
  cleanVariant
}
