export const PAYMENT_METHODS = {
	MERCANTIL_PANAMA: 'Mercantil Panamá',
	PAYONEER: 'Payoneer',
	PAYPAL: 'Paypal',
	CASH: 'Cash',
};

export const CATEGORIES = {
	PET: {
		name: 'Pet',
		// keywords: [],
	},
	PURCHASE: {
		name: 'Purchase',
		keywords: ['amazon'],
	},
	FOOD_HOME: {
		name: 'Food/Home',
		keywords: ['forum', 'pedidosya', 'pedidos ya'],
	},
	ENTERTAIMENT: {
		name: 'Entertaiment',
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
		// keywords: [],
	},
	HEALTH: {
		name: 'Health',
		keywords: ['gym', 'doctor', 'dentist', 'pharmacy', 'hospital'],
	},
	DONATION: {
		name: 'Donation',
		keywords: ['donation', 'donaciones'],
	},
	TRANSPORT: {
		name: 'Transport',
		keywords: ['uber', 'cabify', 'taxi', 'gas', 'gasolina', 'gasoline', 'transporte', 'transport', 'ridery'],
	},
	VEHICLE: {
		name: 'Vehicle',
		// keywords: [],
	},
	LOANS: {
		name: 'Loans',
		keywords: ['loan', 'prestamo', 'prestamos'],
	},
	EXCHANGE: {
		name: 'Exchange',
		keywords: ['exchange', 'cambio', 'cambios', 'pp'],
	},
	WORK: {
		name: 'Work',
		// keywords: []
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
