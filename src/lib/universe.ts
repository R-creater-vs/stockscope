/**
 * The scan universe: liquid NSE large- and mid-caps.
 *
 * Names are stored here rather than fetched so the screener needs one API call
 * per stock instead of two. They are display-only — every number in a result
 * comes from the live price series.
 *
 * Symbols that stop resolving (delistings, demergers, renames) simply drop out
 * of the scan: the screener skips anything that errors, so a stale entry costs
 * a wasted request and nothing else.
 */

export interface UniverseEntry {
  symbol: string;
  name: string;
  sector: string;
}

export const UNIVERSE: UniverseEntry[] = [
  // --- Banking & financials ------------------------------------------------
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', sector: 'Financials' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', sector: 'Financials' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', sector: 'Financials' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', sector: 'Financials' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank', sector: 'Financials' },
  { symbol: 'INDUSINDBK.NS', name: 'IndusInd Bank', sector: 'Financials' },
  { symbol: 'BANKBARODA.NS', name: 'Bank of Baroda', sector: 'Financials' },
  { symbol: 'PNB.NS', name: 'Punjab National Bank', sector: 'Financials' },
  { symbol: 'CANBK.NS', name: 'Canara Bank', sector: 'Financials' },
  { symbol: 'IDFCFIRSTB.NS', name: 'IDFC First Bank', sector: 'Financials' },
  { symbol: 'FEDERALBNK.NS', name: 'Federal Bank', sector: 'Financials' },
  { symbol: 'AUBANK.NS', name: 'AU Small Finance Bank', sector: 'Financials' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance', sector: 'Financials' },
  { symbol: 'BAJAJFINSV.NS', name: 'Bajaj Finserv', sector: 'Financials' },
  { symbol: 'CHOLAFIN.NS', name: 'Cholamandalam Investment', sector: 'Financials' },
  { symbol: 'MUTHOOTFIN.NS', name: 'Muthoot Finance', sector: 'Financials' },
  { symbol: 'SHRIRAMFIN.NS', name: 'Shriram Finance', sector: 'Financials' },
  { symbol: 'LICHSGFIN.NS', name: 'LIC Housing Finance', sector: 'Financials' },
  { symbol: 'RECLTD.NS', name: 'REC Ltd', sector: 'Financials' },
  { symbol: 'PFC.NS', name: 'Power Finance Corp', sector: 'Financials' },
  { symbol: 'IRFC.NS', name: 'Indian Railway Finance', sector: 'Financials' },
  { symbol: 'SBILIFE.NS', name: 'SBI Life Insurance', sector: 'Financials' },
  { symbol: 'HDFCLIFE.NS', name: 'HDFC Life Insurance', sector: 'Financials' },
  { symbol: 'ICICIGI.NS', name: 'ICICI Lombard', sector: 'Financials' },
  { symbol: 'POLICYBZR.NS', name: 'PB Fintech', sector: 'Financials' },

  // --- Technology ----------------------------------------------------------
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'Technology' },
  { symbol: 'INFY.NS', name: 'Infosys', sector: 'Technology' },
  { symbol: 'HCLTECH.NS', name: 'HCL Technologies', sector: 'Technology' },
  { symbol: 'WIPRO.NS', name: 'Wipro', sector: 'Technology' },
  { symbol: 'TECHM.NS', name: 'Tech Mahindra', sector: 'Technology' },
  { symbol: 'MPHASIS.NS', name: 'Mphasis', sector: 'Technology' },
  { symbol: 'PERSISTENT.NS', name: 'Persistent Systems', sector: 'Technology' },
  { symbol: 'COFORGE.NS', name: 'Coforge', sector: 'Technology' },
  { symbol: 'OFSS.NS', name: 'Oracle Financial Services', sector: 'Technology' },
  { symbol: 'NAUKRI.NS', name: 'Info Edge', sector: 'Technology' },

  // --- Energy & utilities --------------------------------------------------
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'ONGC.NS', name: 'Oil & Natural Gas Corp', sector: 'Energy' },
  { symbol: 'IOC.NS', name: 'Indian Oil Corp', sector: 'Energy' },
  { symbol: 'BPCL.NS', name: 'Bharat Petroleum', sector: 'Energy' },
  { symbol: 'GAIL.NS', name: 'GAIL India', sector: 'Energy' },
  { symbol: 'PETRONET.NS', name: 'Petronet LNG', sector: 'Energy' },
  { symbol: 'NTPC.NS', name: 'NTPC', sector: 'Utilities' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid Corp', sector: 'Utilities' },
  { symbol: 'TATAPOWER.NS', name: 'Tata Power', sector: 'Utilities' },
  { symbol: 'ADANIGREEN.NS', name: 'Adani Green Energy', sector: 'Utilities' },
  { symbol: 'ADANIPOWER.NS', name: 'Adani Power', sector: 'Utilities' },
  { symbol: 'JSWENERGY.NS', name: 'JSW Energy', sector: 'Utilities' },
  { symbol: 'SUZLON.NS', name: 'Suzlon Energy', sector: 'Utilities' },
  { symbol: 'COALINDIA.NS', name: 'Coal India', sector: 'Energy' },

  // --- Autos ---------------------------------------------------------------
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki', sector: 'Auto' },
  { symbol: 'M&M.NS', name: 'Mahindra & Mahindra', sector: 'Auto' },
  // Tata Motors demerged in 2025; both arms list separately.
  { symbol: 'TMCV.NS', name: 'Tata Motors (Commercial)', sector: 'Auto' },
  { symbol: 'TMPV.NS', name: 'Tata Motors (Passenger)', sector: 'Auto' },
  { symbol: 'BAJAJ-AUTO.NS', name: 'Bajaj Auto', sector: 'Auto' },
  { symbol: 'EICHERMOT.NS', name: 'Eicher Motors', sector: 'Auto' },
  { symbol: 'HEROMOTOCO.NS', name: 'Hero MotoCorp', sector: 'Auto' },
  { symbol: 'TVSMOTOR.NS', name: 'TVS Motor', sector: 'Auto' },
  { symbol: 'ASHOKLEY.NS', name: 'Ashok Leyland', sector: 'Auto' },
  { symbol: 'BALKRISIND.NS', name: 'Balkrishna Industries', sector: 'Auto' },
  { symbol: 'MRF.NS', name: 'MRF', sector: 'Auto' },
  { symbol: 'APOLLOTYRE.NS', name: 'Apollo Tyres', sector: 'Auto' },
  { symbol: 'BOSCHLTD.NS', name: 'Bosch', sector: 'Auto' },

  // --- Metals & mining -----------------------------------------------------
  { symbol: 'TATASTEEL.NS', name: 'Tata Steel', sector: 'Metals' },
  { symbol: 'JSWSTEEL.NS', name: 'JSW Steel', sector: 'Metals' },
  { symbol: 'HINDALCO.NS', name: 'Hindalco Industries', sector: 'Metals' },
  { symbol: 'VEDL.NS', name: 'Vedanta', sector: 'Metals' },
  { symbol: 'JINDALSTEL.NS', name: 'Jindal Steel & Power', sector: 'Metals' },
  { symbol: 'SAIL.NS', name: 'Steel Authority of India', sector: 'Metals' },
  { symbol: 'NMDC.NS', name: 'NMDC', sector: 'Metals' },
  { symbol: 'HINDZINC.NS', name: 'Hindustan Zinc', sector: 'Metals' },

  // --- Pharma & healthcare -------------------------------------------------
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical', sector: 'Pharma' },
  { symbol: 'CIPLA.NS', name: 'Cipla', sector: 'Pharma' },
  { symbol: 'DRREDDY.NS', name: "Dr Reddy's Laboratories", sector: 'Pharma' },
  { symbol: 'DIVISLAB.NS', name: 'Divi’s Laboratories', sector: 'Pharma' },
  { symbol: 'TORNTPHARM.NS', name: 'Torrent Pharmaceuticals', sector: 'Pharma' },
  { symbol: 'LUPIN.NS', name: 'Lupin', sector: 'Pharma' },
  { symbol: 'AUROPHARMA.NS', name: 'Aurobindo Pharma', sector: 'Pharma' },
  { symbol: 'ALKEM.NS', name: 'Alkem Laboratories', sector: 'Pharma' },
  { symbol: 'ZYDUSLIFE.NS', name: 'Zydus Lifesciences', sector: 'Pharma' },
  { symbol: 'BIOCON.NS', name: 'Biocon', sector: 'Pharma' },
  { symbol: 'APOLLOHOSP.NS', name: 'Apollo Hospitals', sector: 'Pharma' },
  { symbol: 'MAXHEALTH.NS', name: 'Max Healthcare', sector: 'Pharma' },

  // --- FMCG & consumer -----------------------------------------------------
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', sector: 'FMCG' },
  { symbol: 'ITC.NS', name: 'ITC', sector: 'FMCG' },
  { symbol: 'NESTLEIND.NS', name: 'Nestle India', sector: 'FMCG' },
  { symbol: 'BRITANNIA.NS', name: 'Britannia Industries', sector: 'FMCG' },
  { symbol: 'DABUR.NS', name: 'Dabur India', sector: 'FMCG' },
  { symbol: 'MARICO.NS', name: 'Marico', sector: 'FMCG' },
  { symbol: 'GODREJCP.NS', name: 'Godrej Consumer Products', sector: 'FMCG' },
  { symbol: 'COLPAL.NS', name: 'Colgate-Palmolive India', sector: 'FMCG' },
  { symbol: 'TATACONSUM.NS', name: 'Tata Consumer Products', sector: 'FMCG' },
  { symbol: 'VBL.NS', name: 'Varun Beverages', sector: 'FMCG' },
  { symbol: 'UBL.NS', name: 'United Breweries', sector: 'FMCG' },
  { symbol: 'PAGEIND.NS', name: 'Page Industries', sector: 'Consumer' },
  { symbol: 'TITAN.NS', name: 'Titan Company', sector: 'Consumer' },
  { symbol: 'TRENT.NS', name: 'Trent', sector: 'Consumer' },
  { symbol: 'DMART.NS', name: 'Avenue Supermarts', sector: 'Consumer' },
  { symbol: 'JUBLFOOD.NS', name: 'Jubilant FoodWorks', sector: 'Consumer' },
  { symbol: 'HAVELLS.NS', name: 'Havells India', sector: 'Consumer' },
  { symbol: 'ETERNAL.NS', name: 'Eternal (formerly Zomato)', sector: 'Consumer' },
  { symbol: 'NYKAA.NS', name: 'FSN E-Commerce (Nykaa)', sector: 'Consumer' },

  // --- Industrials & infra -------------------------------------------------
  { symbol: 'LT.NS', name: 'Larsen & Toubro', sector: 'Industrials' },
  { symbol: 'SIEMENS.NS', name: 'Siemens India', sector: 'Industrials' },
  { symbol: 'ABB.NS', name: 'ABB India', sector: 'Industrials' },
  { symbol: 'BHEL.NS', name: 'Bharat Heavy Electricals', sector: 'Industrials' },
  { symbol: 'BEL.NS', name: 'Bharat Electronics', sector: 'Industrials' },
  { symbol: 'HAL.NS', name: 'Hindustan Aeronautics', sector: 'Industrials' },
  { symbol: 'CUMMINSIND.NS', name: 'Cummins India', sector: 'Industrials' },
  { symbol: 'CONCOR.NS', name: 'Container Corp of India', sector: 'Industrials' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises', sector: 'Industrials' },
  { symbol: 'ADANIPORTS.NS', name: 'Adani Ports & SEZ', sector: 'Industrials' },
  { symbol: 'INDIGO.NS', name: 'InterGlobe Aviation', sector: 'Industrials' },
  { symbol: 'IRCTC.NS', name: 'Indian Railway Catering', sector: 'Industrials' },

  // --- Cement & materials --------------------------------------------------
  { symbol: 'ULTRACEMCO.NS', name: 'UltraTech Cement', sector: 'Materials' },
  { symbol: 'GRASIM.NS', name: 'Grasim Industries', sector: 'Materials' },
  { symbol: 'SHREECEM.NS', name: 'Shree Cement', sector: 'Materials' },
  { symbol: 'AMBUJACEM.NS', name: 'Ambuja Cements', sector: 'Materials' },
  { symbol: 'ACC.NS', name: 'ACC', sector: 'Materials' },
  { symbol: 'DALBHARAT.NS', name: 'Dalmia Bharat', sector: 'Materials' },
  { symbol: 'ASIANPAINT.NS', name: 'Asian Paints', sector: 'Materials' },
  { symbol: 'BERGEPAINT.NS', name: 'Berger Paints India', sector: 'Materials' },
  { symbol: 'PIDILITIND.NS', name: 'Pidilite Industries', sector: 'Materials' },
  { symbol: 'UPL.NS', name: 'UPL', sector: 'Materials' },

  // --- Telecom, realty & media ---------------------------------------------
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', sector: 'Telecom' },
  { symbol: 'IDEA.NS', name: 'Vodafone Idea', sector: 'Telecom' },
  { symbol: 'TATACOMM.NS', name: 'Tata Communications', sector: 'Telecom' },
  { symbol: 'DLF.NS', name: 'DLF', sector: 'Realty' },
  { symbol: 'GODREJPROP.NS', name: 'Godrej Properties', sector: 'Realty' },
  { symbol: 'OBEROIRLTY.NS', name: 'Oberoi Realty', sector: 'Realty' },
  { symbol: 'PHOENIXLTD.NS', name: 'Phoenix Mills', sector: 'Realty' },
  { symbol: 'INDHOTEL.NS', name: 'Indian Hotels Company', sector: 'Consumer' },
  { symbol: 'PVRINOX.NS', name: 'PVR INOX', sector: 'Media' },
  { symbol: 'SUNTV.NS', name: 'Sun TV Network', sector: 'Media' },

  // --- Affordable mid-caps (broadening the ₹100–250 band) ------------------
  // Liquid names that mostly trade in the ₹100–250 range, so the price filter
  // and the "best track record" ranking have real depth to work with. Prices
  // move, so a few may sit just outside the band on any given day — the live
  // filter handles that; anything that stops resolving simply drops from scans.
  { symbol: 'BANDHANBNK.NS', name: 'Bandhan Bank', sector: 'Financials' },
  { symbol: 'RBLBANK.NS', name: 'RBL Bank', sector: 'Financials' },
  { symbol: 'UNIONBANK.NS', name: 'Union Bank of India', sector: 'Financials' },
  { symbol: 'BANKINDIA.NS', name: 'Bank of India', sector: 'Financials' },
  { symbol: 'KARURVYSYA.NS', name: 'Karur Vysya Bank', sector: 'Financials' },
  { symbol: 'CUB.NS', name: 'City Union Bank', sector: 'Financials' },
  { symbol: 'MANAPPURAM.NS', name: 'Manappuram Finance', sector: 'Financials' },
  { symbol: 'IDBI.NS', name: 'IDBI Bank', sector: 'Financials' },
  { symbol: 'IREDA.NS', name: 'Indian Renewable Energy', sector: 'Financials' },
  { symbol: 'IEX.NS', name: 'Indian Energy Exchange', sector: 'Financials' },
  { symbol: 'HUDCO.NS', name: 'Housing & Urban Development', sector: 'Financials' },
  { symbol: 'NHPC.NS', name: 'NHPC', sector: 'Utilities' },
  { symbol: 'SJVN.NS', name: 'SJVN', sector: 'Utilities' },
  { symbol: 'CESC.NS', name: 'CESC', sector: 'Utilities' },
  { symbol: 'NLCINDIA.NS', name: 'NLC India', sector: 'Utilities' },
  { symbol: 'MRPL.NS', name: 'Mangalore Refinery', sector: 'Energy' },
  { symbol: 'NATIONALUM.NS', name: 'National Aluminium', sector: 'Metals' },
  { symbol: 'HINDCOPPER.NS', name: 'Hindustan Copper', sector: 'Metals' },
  { symbol: 'IRCON.NS', name: 'Ircon International', sector: 'Industrials' },
  { symbol: 'NBCC.NS', name: 'NBCC (India)', sector: 'Industrials' },
  { symbol: 'RVNL.NS', name: 'Rail Vikas Nigam', sector: 'Industrials' },
  { symbol: 'GMRAIRPORT.NS', name: 'GMR Airports', sector: 'Industrials' },
  { symbol: 'ENGINERSIN.NS', name: 'Engineers India', sector: 'Industrials' },
  { symbol: 'RITES.NS', name: 'RITES', sector: 'Industrials' },
  { symbol: 'GPPL.NS', name: 'Gujarat Pipavav Port', sector: 'Industrials' },
  { symbol: 'SCI.NS', name: 'Shipping Corp of India', sector: 'Industrials' },
  { symbol: 'RCF.NS', name: 'Rashtriya Chemicals', sector: 'Materials' },
  { symbol: 'GSFC.NS', name: 'Gujarat State Fertilizers', sector: 'Materials' },
  { symbol: 'INDIACEM.NS', name: 'India Cements', sector: 'Materials' },
  { symbol: 'MOTHERSON.NS', name: 'Samvardhana Motherson', sector: 'Auto' },
  { symbol: 'HFCL.NS', name: 'HFCL', sector: 'Telecom' },
  { symbol: 'STLTECH.NS', name: 'Sterlite Technologies', sector: 'Telecom' },
];

/** Nifty 50 index — used as the market-regime filter, not scanned as a stock. */
export const MARKET_INDEX = { symbol: '^NSEI', name: 'Nifty 50' };

export const SECTORS = Array.from(new Set(UNIVERSE.map((u) => u.sector))).sort();
