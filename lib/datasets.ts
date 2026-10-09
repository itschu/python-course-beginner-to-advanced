/** Datasets bundled in public/data. Code can open them as "data/<file>". */
export interface Dataset {
  file: string;
  title: string;
  description: string;
  columns: string;
  synthetic: boolean;
}

export const datasets: Dataset[] = [
  {
    file: "matches.csv",
    title: "Football league results and odds",
    description:
      "Three seasons of a 20-team league (1,140 matches) with goals, shots and average bookmaker odds. Same layout as Football-Data.co.uk files, but synthetic: team names are made up and results are simulated from a realistic goal model.",
    columns: "Season, Date, HomeTeam, AwayTeam, FTHG, FTAG, FTR, HS, AS, HST, AST, AvgH, AvgD, AvgA",
    synthetic: true,
  },
  {
    file: "eurusd_daily.csv",
    title: "EUR/USD-style daily prices",
    description:
      "Ten years of daily open, high, low and close prices for a simulated currency pair with changing volatility. Use it to practise returns, rolling features and backtests.",
    columns: "Date, Open, High, Low, Close",
    synthetic: true,
  },
  {
    file: "sales.csv",
    title: "Shop sales",
    description: "A year of daily sales for a small chain of shops. Clean and ready for pandas practice.",
    columns: "Date, Store, Product, Category, Units, UnitPrice",
    synthetic: true,
  },
  {
    file: "customers_messy.csv",
    title: "Messy customer records",
    description:
      "Deliberately dirty data for the cleaning lesson: missing values, inconsistent spelling, numbers stored as text, duplicates and bad dates.",
    columns: "customer_id, name, city, signup_date, age, plan, monthly_spend",
    synthetic: true,
  },
  {
    file: "houses.csv",
    title: "House prices",
    description: "800 homes with size, rooms, age, distance to the centre, neighbourhood and sale price. For regression.",
    columns: "size_sqm, bedrooms, bathrooms, age_years, distance_km, neighbourhood, has_garden, price",
    synthetic: true,
  },
  {
    file: "poisson_predictions.csv",
    title: "Walk-forward goal-model predictions",
    description:
      "Home/draw/away probabilities and expected goals from the Phase 6 Poisson goal model for the 2023-24 and 2024-25 seasons, each predicted using only earlier matches. Saves refitting the model in the browser.",
    columns: "Season, Date, HomeTeam, AwayTeam, FTHG, FTAG, FTR, AvgH, AvgD, AvgA, LamH, LamA, pH, pD, pA",
    synthetic: true,
  },
  {
    file: "reviews.csv",
    title: "Product reviews",
    description: "Short product reviews labelled positive or negative. For text classification.",
    columns: "review, sentiment",
    synthetic: true,
  },
];
