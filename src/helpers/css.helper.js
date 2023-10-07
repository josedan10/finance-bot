export function convertStringIntoCSSSelectorClasses(string) {
	return string
		.split(' ')
		.map((word) => (word !== '' ? `.${word}` : ''))
		.join('');
}
