define(['beta', 'mappedSub'], function(beta, mapped) {
	beta();
	mapped();
	require(['lazyloaded'], function(lazyloaded) {
		lazyloaded();
	});
	return function() {
		console.log('this is alpha');
	};
});
