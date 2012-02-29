define(['sub/gamma'], function(gamma) {
	gamma();
	return function() {
		console.log('this is beta');
	};
});

