export const enum PAYMENT_METHODS {
	MERCANTIL_PANAMA = 'Mercantil Panamá',
	PAYONEER = 'Payoneer',
	PAYPAL = 'Paypal',
	CASH = 'Cash',
	BINANCE = 'Binance',
	MERCANTIL_VENEZUELA = 'Mercantil Venezuela',
}

export const PAYMENT_METHODS_ARRAY = [
	PAYMENT_METHODS.BINANCE,
	PAYMENT_METHODS.CASH,
	PAYMENT_METHODS.MERCANTIL_PANAMA,
	PAYMENT_METHODS.MERCANTIL_VENEZUELA,
	PAYMENT_METHODS.PAYONEER,
	PAYMENT_METHODS.PAYPAL,
];

export const CATEGORIES = {
	PET: {
		name: 'Pet',
		emoji: '🐾',
		keywords: [
			'mascotalandia',
			'mascotas',
			'pet',
			'pets',
			'petshop',
			'pet shop',
			'veterinaria',
			'veterinary',
			'Cooper',
		],
	},
	SHOPPING: {
		name: 'Shopping',
		emoji: '🛍️',
		keywords: ['amazon', 'fravega', 'mercadolibre', 'shopping', 'purchase'],
	},
	FOOD_DINING: {
		name: 'Food & Dining',
		emoji: '🍽️',
		keywords: [
			'forum',
			'pedidosya',
			'pedidos ya',
			'excelsior gama',
			'panaderia',
			'supermercado',
			'supermarket',
			'market',
			'mercado',
			'rappi',
			'quecachapa',
			'mc donalds',
			'burgiopizza',
			'havanna',
			'starbucks',
			'restaurant',
		],
	},
	ENTERTAINMENT: {
		name: 'Entertainment',
		emoji: '🎬',
		keywords: [
			'netflix',
			'spotify',
			'disney',
			'hbo',
			'hulu',
			'prime',
			'youtube',
			'playstation',
			'xbox',
			'steam',
			'itunes',
			'appstore',
			'google',
			'patreon',
			'showcase',
			'cinema',
		],
	},
	OTHER: {
		name: 'Other',
		emoji: '💼',
		keywords: ['belo'],
	},
	HEALTH_FITNESS: {
		name: 'Health & Fitness',
		emoji: '🩺',
		keywords: [
			'gym',
			'doctor',
			'dentist',
			'pharmacy',
			'hospital',
			'consulta médica',
			'farmacia',
			'medico',
			'medica',
			'farmatodo',
			'farmacia saas',
			'medical',
			'swiss medical',
		],
	},
	DONATION: {
		name: 'Donation',
		emoji: '💰',
		keywords: ['donation', 'donaciones'],
	},
	TRANSPORTATION: {
		name: 'Transportation',
		emoji: '🚕',
		keywords: [
			'uber',
			'cabify',
			'taxi',
			'gas',
			'gasolina',
			'gasoline',
			'transporte',
			'transport',
			'ridery',
			'didi',
			'tembici',
			'sube',
			'emova',
			'subte',
		],
	},
	VEHICLE: {
		name: 'Vehicle',
		emoji: '🚗',
		// keywords: [],
	},
	LOANS: {
		name: 'Loans',
		emoji: '💳',
		keywords: ['loan', 'prestamo', 'prestamos'],
	},
	EXCHANGE: {
		name: 'Exchange',
		emoji: '💱',
		keywords: ['exchange', 'cambio', 'cambios', 'pp', 'maffi', 'productora audiovisual'],
	},
	FREELANCE: {
		name: 'Freelance',
		emoji: '👨‍💻',
		keywords: ['freelance', 'vettx', 'relay', 'jose quintero', 'pago de servicios'],
	},
	TRAVEL: {
		name: 'Travel',
		emoji: '✈️',
		keywords: ['flight', 'hotel', 'airbnb', 'booking', 'expedia', 'tripadvisor'],
	},
	BEAUTY: {
		name: 'Beauty',
		emoji: '💅',
		keywords: ['salon', 'barber', 'cosmetics', 'makeup', 'skincare'],
	},
	EDUCATION: {
		name: 'Education',
		emoji: '🎓',
		keywords: [
			'university',
			'school',
			'online courses',
			'udemy',
			'coursera',
			'platzi',
			'codigo facilito',
			'codigofacilito',
		],
	},
	SALARY: {
		name: 'Salary',
		emoji: '💵',
		keywords: ['salary', 'payroll', 'nomina', 'sueldo', 'pago'],
	},
	INVESTMENT: {
		name: 'Investment',
		emoji: '📈',
		keywords: ['investment', 'dividends', 'stocks', 'crypto', 'binance'],
	},
};

export const enum SUSCRIPTION_TYPES {
	MONTHLY = 'Monthly',
	ANNUAL = 'Annual',
}

export const enum SUSCRIPTION_NAMES {
	AMAZON_PRIME = 'Amazon Prime',
	MEDIUM = 'Medium',
	DISNEY_PLUS = 'Disney Plus',
	PLATZI = 'Platzi',
	LASTPASS = 'Lastpass',
	DIGITAL_OCEAN = 'Digital Ocean',
	EXPRESSVPN = 'ExpressVPN',
	GOOGLE_ONE = 'Google One',
	GYM = 'Gym',
	CODIGO_FACILITO = 'Código Facilito',
	DASHLANE = 'Dashlane',
	GITHUB_COPILOT = 'Github Copilot',
}

interface Suscription {
	name: string;
	type: string;
	paymentDate?: string;
}

export const suscriptions: Suscription[] = [
	{
		name: SUSCRIPTION_NAMES.AMAZON_PRIME,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
	{
		name: SUSCRIPTION_NAMES.MEDIUM,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
	{
		name: SUSCRIPTION_NAMES.DISNEY_PLUS,
		type: SUSCRIPTION_TYPES.MONTHLY,
	},
	{
		name: SUSCRIPTION_NAMES.PLATZI,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
	{
		name: SUSCRIPTION_NAMES.LASTPASS,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
	{
		name: SUSCRIPTION_NAMES.DIGITAL_OCEAN,
		type: SUSCRIPTION_TYPES.MONTHLY,
	},
	{
		name: SUSCRIPTION_NAMES.EXPRESSVPN,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
	{
		name: SUSCRIPTION_NAMES.GOOGLE_ONE,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
	{
		name: SUSCRIPTION_NAMES.GYM,
		type: SUSCRIPTION_TYPES.MONTHLY,
	},
	{
		name: SUSCRIPTION_NAMES.CODIGO_FACILITO,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
	{
		name: SUSCRIPTION_NAMES.DASHLANE,
		type: SUSCRIPTION_TYPES.ANNUAL,
	},
];
