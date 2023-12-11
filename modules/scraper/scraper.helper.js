export function sleep(ms = 3000) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomSleep(min = 1000, max = 5000) {
	const random = Math.random() * (max - min) + min;
	return sleep(random);
}
