define(['beta', 'mappedSub'], function(beta, mapped) {
	beta();
	mapped();
	require(['lazyloaded'], function(lazyloaded) {
		lazyloaded();
	});
	return function() {
		return 'this is alpha';
	};
});
