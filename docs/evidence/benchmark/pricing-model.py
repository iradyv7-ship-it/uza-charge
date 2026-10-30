"""Pricing comparison for §34.7. Every input is an assumption, printed with the result."""

USD_RWF = 1450            # assumption: verify the BNR rate on the day of any quote
CONNECTORS_PER_STATION = 2
KWH_PER_CONNECTOR_DAY = 60  # assumption: an early-market DC gun in Kigali
PRICE_PER_KWH = 370       # RWF, energy + service (the e2e depot plan)
DAYS = 30

revenue_per_connector_month = KWH_PER_CONNECTOR_DAY * DAYS * PRICE_PER_KWH

SHARE = 0.025             # proposed Operate fee: 2.5% of charging revenue collected
CAP_PER_CONNECTOR_MONTH = 25_000  # RWF

def ours_year(stations: int) -> int:
    per_connector = min(revenue_per_connector_month * SHARE, CAP_PER_CONNECTOR_MONTH)
    return round(per_connector * CONNECTORS_PER_STATION * stations * 12)

def vendor_h5(stations: int, year: int) -> int:
    # USD 1,000 once + USD 1,500 / year, up to 300 stations
    usd = (1000 if year == 1 else 0) + 1500
    return usd * USD_RWF

def vendor_app(stations: int, year: int) -> int:
    usd = (5000 if year == 1 else 0) + 1500
    return usd * USD_RWF

print(f"revenue per connector per month: RWF {revenue_per_connector_month:,}")
print(f"our fee per connector per month: RWF {min(revenue_per_connector_month*SHARE, CAP_PER_CONNECTOR_MONTH):,.0f}")
print()
print("| Stations | UZA Operate / year | Vendor H5 year 1 | Vendor H5 year 2+ | Vendor app year 1 |")
print("|---|---|---|---|---|")
for n in [1, 2, 5, 10, 20, 50]:
    print(f"| {n} | RWF {ours_year(n):,} | RWF {vendor_h5(n,1):,} | RWF {vendor_h5(n,2):,} | RWF {vendor_app(n,1):,} |")

# crossover: stations where our yearly fee equals the vendor's
per_station = ours_year(1)
print()
print(f"crossover vs H5 year 1: {vendor_h5(1,1)/per_station:.1f} stations")
print(f"crossover vs H5 year 2+: {vendor_h5(1,2)/per_station:.1f} stations")
print(f"our fee as share of the operator's gross: {SHARE*100:.1f}%")
print(f"one station's monthly gross: RWF {revenue_per_connector_month*CONNECTORS_PER_STATION:,}")
