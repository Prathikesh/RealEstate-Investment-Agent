import { createContext, useContext, useState, type ReactNode } from 'react'

const TRANSLATIONS = {
  en: {
    // Nav
    dashboard:   'Dashboard',
    properties:  'Properties',
    watching:    'Watching',
    settings:    'Settings',
    logout:      'Logout',

    // Stats cards
    propertiesInArea:  'Properties in Area',
    newToday:          'New Today',
    strongOpps:        'Strong Opportunities',
    worthInvest:       'Worth Investigating',
    priceDrops:        'Price Drops Today',
    avgScore:          'Avg Score',

    // Score categories
    strongOpportunity:  'Strong Opportunity',
    worthInvestigating: 'Worth Investigating',
    marketPrice:        'Market Price',
    notRecommended:     'Not Recommended',

    // Actions
    viewAnalysis:       'View Analysis',
    watchProperty:      'Watch',
    reanalyze:          'Re-analyze',
    backToProperties:   'Back to properties',
    viewOnSource:       'View on',

    // Filters
    filters:       'Filters',
    sortBy:        'Sort by',
    allTypes:      'All types',
    allCities:     'All cities',
    minScore:      'Min score',
    anyScore:      'Any',
    gridView:      'Grid',
    listView:      'List',
    noResults:     'No properties match your filters.',
    noResultsHint: 'Try expanding your price range or area.',

    // Detail page tabs
    aiBrief:      'AI Brief',
    financials:   'Financials',
    comparables:  'Comparables',
    priceHistory: 'Price History',
    sources:      'Sources',

    // Financial labels
    askingPrice:    'Asking Price',
    marketValue:    'Market Value (comparable sales)',
    valueGap:       'Your savings vs market',
    discount:       'Below market price',
    capRate:        'Yearly return (cap rate)',
    cashFlow:       'Monthly profit (cash flow)',
    cashOnCash:     'Return on cash invested',
    noi:            'Net annual income',
    grm:            'Price/rent ratio (GRM)',
    downPayment:    'Your down payment (20%)',
    welcomeTax:     'Welcome tax (droits de mutation)',
    monthlyMortgage:'Monthly mortgage payment',
    rentalIncome:   'Monthly rental income',
    grossIncome:    'Annual gross income',
    municipalTax:   'Municipal property taxes',
    schoolTax:      'School taxes (annual)',
    condoFees:      'Monthly condo fees',
    pricePerSqft:   'Price per sqft',
    compsFound:     'Comparable sales found',

    // Misc
    units:       'units',
    sqft:        'sqft',
    built:       'Built',
    daysOnMarket:'days on market',
    newBadge:    'NEW',
    priceDrop:   'Price Drop',
    active:      'Active',
    topOpps:     'Top Opportunities',
    newListings: 'New Listings',
    coverage:    'Coverage',
    viewAll:     'View all →',
    notFound:    'Property not found',
    notFoundHint:'This listing may have been delisted or removed.',
    browseAll:   'Browse all properties →',
    queued:      'Queued',
    lastAnalyzed:'Last analyzed',
    firstSeen:   'First seen',
    lastChecked: 'Last checked',
    mlsNumber:   'MLS#',
    noPriceHistory:   'No price changes recorded.',
    noComparables:    'No comparables found for this property.',
    noSources:        'No active sources recorded.',
    noAiBrief:        'AI brief not yet generated.',
    noAiBriefLow:     'Score below 40 — brief not generated for this property.',
    runPipeline:      'Click Re-analyze to queue this property.',
    dealProfile:      'Deal Profile',
    confidencePill:   'confidence',
    analyzedUsing:    'analyzed',
    within:           'within',
    medianPrice:      'Median Price',
    meanPrice:        'Mean Price',
    pricedAt:         'Priced',
    belowMarket:      'below market',
    aboveMarket:      'above market',
    originalListing:  'Originally listed',
    totalReduction:   'Total reduction',
    fromOriginal:     'from original',
    settings_title:   'Settings',
    settings_subtitle:'Manage your account and notification preferences.',
    settings_saved:   'Preferences saved',

    // Multi-site comparison
    multiSite:        'Multi-site',
    multiSiteFilter:  'Multi-site only',
    lowestPrice:      'Lowest price',
    lowestPriceSite:  'Lowest price site',
    savingsVsHighest: 'Save vs highest',
    onSites:          'sites',
    priceComparison:  'Price Comparison',
    lastUpdated:      'Updated',
  },
  fr: {
    // Nav
    dashboard:   'Tableau de bord',
    properties:  'Propriétés',
    watching:    'Surveillance',
    settings:    'Paramètres',
    logout:      'Déconnexion',

    // Stats cards
    propertiesInArea:  'Propriétés dans la zone',
    newToday:          'Nouvelles aujourd\'hui',
    strongOpps:        'Opportunités fortes',
    worthInvest:       'À examiner',
    priceDrops:        'Baisses de prix',
    avgScore:          'Score moyen',

    // Score categories
    strongOpportunity:  'Excellente opportunité',
    worthInvestigating: 'À examiner',
    marketPrice:        'Prix du marché',
    notRecommended:     'Non recommandé',

    // Actions
    viewAnalysis:       'Voir l\'analyse',
    watchProperty:      'Surveiller',
    reanalyze:          'Ré-analyser',
    backToProperties:   'Retour aux propriétés',
    viewOnSource:       'Voir sur',

    // Filters
    filters:       'Filtres',
    sortBy:        'Trier par',
    allTypes:      'Tous les types',
    allCities:     'Toutes les villes',
    minScore:      'Score min.',
    anyScore:      'Tout',
    gridView:      'Grille',
    listView:      'Liste',
    noResults:     'Aucune propriété ne correspond à vos filtres.',
    noResultsHint: 'Essayez d\'élargir votre zone ou votre gamme de prix.',

    // Detail page tabs
    aiBrief:      'Analyse IA',
    financials:   'Finances',
    comparables:  'Comparables',
    priceHistory: 'Historique des prix',
    sources:      'Sources',

    // Financial labels
    askingPrice:    'Prix demandé',
    marketValue:    'Valeur marchande (ventes comparables)',
    valueGap:       'Économies vs marché',
    discount:       'Sous le prix du marché',
    capRate:        'Rendement annuel (taux de cap.)',
    cashFlow:       'Profit mensuel (flux de trésorerie)',
    cashOnCash:     'Retour sur mise de fonds',
    noi:            'Revenu net annuel',
    grm:            'Ratio prix/loyer',
    downPayment:    'Votre mise de fonds (20%)',
    welcomeTax:     'Droits de mutation',
    monthlyMortgage:'Paiement hypothécaire mensuel',
    rentalIncome:   'Revenu locatif mensuel',
    grossIncome:    'Revenu brut annuel',
    municipalTax:   'Taxes municipales annuelles',
    schoolTax:      'Taxes scolaires annuelles',
    condoFees:      'Frais de condo mensuels',
    pricePerSqft:   'Prix / pi²',
    compsFound:     'Ventes comparables trouvées',

    // Misc
    units:       'unités',
    sqft:        'pi²',
    built:       'Bâti',
    daysOnMarket:'jours sur le marché',
    newBadge:    'NOUVEAU',
    priceDrop:   'Baisse de prix',
    active:      'Actif',
    topOpps:     'Meilleures opportunités',
    newListings: 'Nouvelles annonces',
    coverage:    'Couverture',
    viewAll:     'Voir tout →',
    notFound:    'Propriété introuvable',
    notFoundHint:'Cette annonce a peut-être été retirée.',
    browseAll:   'Parcourir toutes les propriétés →',
    queued:      'En attente',
    lastAnalyzed:'Dernière analyse',
    firstSeen:   'Première vue',
    lastChecked: 'Dernière vérification',
    mlsNumber:   'MLS#',
    noPriceHistory:   'Aucun changement de prix enregistré.',
    noComparables:    'Aucun comparable trouvé pour cette propriété.',
    noSources:        'Aucune source active enregistrée.',
    noAiBrief:        'Analyse IA non encore générée.',
    noAiBriefLow:     'Score sous 40 — analyse non générée pour cette propriété.',
    runPipeline:      'Cliquez sur Ré-analyser pour soumettre cette propriété.',
    dealProfile:      'Profil de l\'investissement',
    confidencePill:   'confiance',
    analyzedUsing:    'analysés',
    within:           'dans un rayon de',
    medianPrice:      'Prix médian',
    meanPrice:        'Prix moyen',
    pricedAt:         'Affiché à',
    belowMarket:      'sous le marché',
    aboveMarket:      'au-dessus du marché',
    originalListing:  'Mise en vente initiale',
    totalReduction:   'Réduction totale',
    fromOriginal:     'du prix initial',
    settings_title:   'Paramètres',
    settings_subtitle:'Gérez votre compte et vos préférences de notification.',
    settings_saved:   'Préférences enregistrées',

    // Multi-site comparison
    multiSite:        'Multi-site',
    multiSiteFilter:  'Multi-site seulement',
    lowestPrice:      'Prix le plus bas',
    lowestPriceSite:  'Site le moins cher',
    savingsVsHighest: 'Économie vs le plus haut',
    onSites:          'sites',
    priceComparison:  'Comparaison de prix',
    lastUpdated:      'Mis à jour',
  },
} as const

type LangKey = keyof typeof TRANSLATIONS['en']

export type { LangKey }

interface LanguageContextType {
  lang: 'en' | 'fr'
  setLang: (l: 'en' | 'fr') => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

const LANG_KEY = 'quartis.lang'

function initialLang(): 'en' | 'fr' {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'fr') return saved
  } catch { /* ignore */ }
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<'en' | 'fr'>(initialLang)

  // Persist the choice so it survives reloads (previously reset to English).
  const setLang = (l: 'en' | 'fr') => {
    setLangState(l)
    try { localStorage.setItem(LANG_KEY, l) } catch { /* ignore */ }
  }

  const t = (key: string): string => (TRANSLATIONS[lang] as Record<string, string>)[key] ?? key

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider')
  return ctx
}
