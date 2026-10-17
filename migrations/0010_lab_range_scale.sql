-- Normal ranges printed in another scale than the result ("406000 /cmm" against "1.5 - 4.0 lac/cmm")
-- were compared as printed, so flags could be wrong. Puts saved ranges on the result's scale and
-- recomputes flags. Mirrors scaleOf/rangeFor in shared/labs.ts (word boundaries approximated).

WITH s AS (
SELECT id,
  COALESCE(
    CASE WHEN lower(ref_text) GLOB '*lac[^t]*' OR lower(ref_text) GLOB '*lac' OR lower(ref_text) GLOB '*lakh*' THEN 100000.0
         WHEN lower(ref_text) GLOB '*thousand*' OR ref_text GLOB '*10^3*' OR ref_text GLOB '*10[*]3*' OR ref_text LIKE '%10³%' THEN 1000.0
         WHEN lower(ref_text) GLOB '*mill*' OR ref_text GLOB '*10^6*' OR ref_text GLOB '*10[*]6*' OR ref_text LIKE '%10⁶%' THEN 1000000.0 END,
    CASE WHEN lower(unit) GLOB '*lac[^t]*' OR lower(unit) GLOB '*lac' OR lower(unit) GLOB '*lakh*' THEN 100000.0
         WHEN lower(unit) GLOB '*thousand*' OR unit GLOB '*10^3*' OR unit GLOB '*10[*]3*' OR unit LIKE '%10³%' THEN 1000.0
         WHEN lower(unit) GLOB '*mill*' OR unit GLOB '*10^6*' OR unit GLOB '*10[*]6*' OR unit LIKE '%10⁶%' THEN 1000000.0 END,
    1.0)
  /
  COALESCE(
    CASE WHEN lower(value_text) GLOB '*lac[^t]*' OR lower(value_text) GLOB '*lac' OR lower(value_text) GLOB '*lakh*' THEN 100000.0
         WHEN lower(value_text) GLOB '*thousand*' OR value_text GLOB '*10^3*' OR value_text LIKE '%10³%' THEN 1000.0
         WHEN lower(value_text) GLOB '*mill*' OR value_text GLOB '*10^6*' OR value_text LIKE '%10⁶%' THEN 1000000.0 END,
    CASE WHEN lower(unit) GLOB '*lac[^t]*' OR lower(unit) GLOB '*lac' OR lower(unit) GLOB '*lakh*' THEN 100000.0
         WHEN lower(unit) GLOB '*thousand*' OR unit GLOB '*10^3*' OR unit GLOB '*10[*]3*' OR unit LIKE '%10³%' THEN 1000.0
         WHEN lower(unit) GLOB '*mill*' OR unit GLOB '*10^6*' OR unit GLOB '*10[*]6*' OR unit LIKE '%10⁶%' THEN 1000000.0 END,
    1.0) AS factor
FROM lab_values
WHERE ref_low IS NOT NULL OR ref_high IS NOT NULL
)
UPDATE lab_values
SET ref_low = lab_values.ref_low * s.factor,
    ref_high = lab_values.ref_high * s.factor
FROM s
WHERE s.id = lab_values.id AND s.factor != 1.0;

-- Recompute every flag from the (now consistent) numbers: same rule as flagOf.
UPDATE lab_values
SET flag = CASE WHEN value IS NULL THEN NULL
                WHEN ref_high IS NOT NULL AND value > ref_high THEN 'high'
                WHEN ref_low IS NOT NULL AND value < ref_low THEN 'low'
                ELSE NULL END
WHERE ref_low IS NOT NULL OR ref_high IS NOT NULL;
