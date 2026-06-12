-- P3-002: connector taxonomy seed — the published mechanical/electrical/data
-- interface standards of the FPV ecosystem (docs/systems/component-database.md §2).
-- These are industry conventions, not invented data: dimensions are the
-- pattern DEFINITIONS that datasheets reference (e.g. "30.5×30.5 mounting").
-- Component rows must still cite their own datasheet for which pattern they
-- carry (D10/P3-004).

INSERT INTO connector_types (id, kind, params) VALUES
  -- FC/ESC stack mounting patterns (hole spacing × hole spacing, screw size)
  ('stack-30.5x30.5-M3', 'mechanical', '{"spacingMm": 30.5, "screw": "M3", "note": "full-size FC/ESC stack pattern"}'),
  ('stack-25.5x25.5-M2', 'mechanical', '{"spacingMm": 25.5, "screw": "M2", "note": "mini stack pattern"}'),
  ('stack-20x20-M2',     'mechanical', '{"spacingMm": 20.0, "screw": "M2", "note": "20×20 micro stack pattern"}'),
  -- motor base bolt patterns (square spacing, screw size)
  ('motor-16x16-M3',     'mechanical', '{"spacingMm": 16.0, "screw": "M3", "note": "22xx-class motor base"}'),
  ('motor-19x19-M3',     'mechanical', '{"spacingMm": 19.0, "screw": "M3", "note": "28xx-class motor base"}'),
  ('motor-12x12-M2',     'mechanical', '{"spacingMm": 12.0, "screw": "M2", "note": "14xx/15xx-class motor base"}'),
  -- prop interfaces
  ('prop-shaft-M5',      'mechanical', '{"threadMm": 5.0, "note": "threaded 5 mm prop shaft with nut"}'),
  ('prop-tmount-M2',     'mechanical', '{"screw": "M2", "holes": 2, "note": "T-mount two-screw prop interface"}'),
  -- battery/power connectors (AMASS family ratings per manufacturer spec)
  ('XT60',               'electrical', '{"ratedA": 60, "note": "AMASS XT60"}'),
  ('XT30',               'electrical', '{"ratedA": 30, "note": "AMASS XT30"}'),
  ('JST-PH-2',           'electrical', '{"pitchMm": 2.0, "note": "JST PH 2-pin, 2 mm pitch"}'),
  -- data buses
  ('UART',               'data',       '{"note": "asynchronous serial, voltage per board spec"}'),
  ('I2C',                'data',       '{"note": "two-wire bus, address space per device"}')
ON CONFLICT (id) DO NOTHING;
