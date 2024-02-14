export const PAYMENT_METHODS = {
	MERCANTIL_PANAMA: 'Mercantil Panamá',
	PAYONEER: 'Payoneer',
	PAYPAL: 'Paypal',
	CASH: 'Cash',
	BINANCE: 'Binance',
	MERCANTIL_VENEZUELA: 'Mercantil Venezuela',
};

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
	PURCHASE: {
		name: 'Purchase',
		emoji: '🛍️',
		keywords: ['amazon'],
	},
	FOOD_HOME: {
		name: 'Food/Home',
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
		],
	},
	ENTERTAIMENT: {
		name: 'Entertaiment',
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
		],
	},
	OTHER: {
		name: 'Other',
		emoji: '💼',
		// keywords: [],
	},
	HEALTH: {
		name: 'Health',
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
		],
	},
	DONATION: {
		name: 'Donation',
		emoji: '💰',
		keywords: ['donation', 'donaciones'],
	},
	TRANSPORT: {
		name: 'Transport',
		emoji: '🚕',
		keywords: ['uber', 'cabify', 'taxi', 'gas', 'gasolina', 'gasoline', 'transporte', 'transport', 'ridery'],
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
	WORK: {
		name: 'Work',
		emoji: '👔',
		// keywords: []
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
};

export const SUSCRIPTION_TYPES = {
	MONTHLY: 'Monthly',
	ANNUAL: 'Annual',
};

export const SUSCRIPTION_NAMES = {
	AMAZON_PRIME: 'Amazon Prime',
	MEDIUM: 'Medium',
	DISNEY_PLUS: 'Disney Plus',
	PLATZI: 'Platzi',
	LASTPASS: 'Lastpass',
	DIGITAL_OCEAN: 'Digital Ocean',
	EXPRESSVPN: 'ExpressVPN',
	GOOGLE_ONE: 'Google One',
	GYM: 'Gym',
	CODIGO_FACILITO: 'Código Facilito',
	DASHLANE: 'Dashlane',
	GITHUB_COPILOT: 'Github Copilot',
};

export const suscriptions = [
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
