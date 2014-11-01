var template = '\
<div data-bind="style: containerStyle"> \
	<!-- ko foreach: blocks --> \
		<div data-bind="foreach: children, style: blockStyle"> \
			<!-- ko template: { name: $parents[1].data.childTemplate, data: $data } --> \
			<!-- /ko --> \
		</div> \
	<!-- /ko --> \
</div>';

function getBrowserScrollSize(){

    var css = {
        "border":  "none",
        "height":  "200px",
        "margin":  "0",
        "padding": "0",
        "width":   "200px"
    };

    var inner = $("<div>").css($.extend({}, css));
    var outer = $("<div>").css($.extend({
        "left":       "-1000px",
        "overflow":   "scroll",
        "position":   "absolute",
        "top":        "-1000px"
    }, css)).append(inner).appendTo("body")
    .scrollLeft(1000)
    .scrollTop(1000);

    var scrollSize = {
        "height": (outer.offset().top - inner.offset().top) || 0,
        "width": (outer.offset().left - inner.offset().left) || 0
    };

    outer.remove();
    return scrollSize;
};

function SharedData() {
	var self = this;

	self.resource = null;
	self.element = null;
	self.childTemplate = null;
	self.childSize = null;

	self.elementSize = ko.observable();
	self.childCount = ko.observable(10000);
	self.scrollTop = ko.observable();

	self.gridSize = ko.pureComputed(function () {
		var elementSize = self.elementSize();
		var childSize = ko.unwrap(self.childSize);

		if (elementSize == undefined ||
			childSize == undefined ||
			childSize.width == 0 ||
			childSize.height == 0)
		{
			return {
				cols: 0,
				rows: 0,
			};
		}

		var cols = Math.floor((elementSize.width - getBrowserScrollSize().width) / childSize.width);
		var rows = Math.ceil(elementSize.height / childSize.height);

		if (cols == 0)
		{
			cols = 1;
		}

		if (rows == 0)
		{
			rows = 1;
		}

		return {
			cols: cols,
			rows: rows,
		};
	});

	self.blockSize = ko.pureComputed(function () {
		var grid = self.gridSize();

		return grid.cols * grid.rows;
	});
};

function Block(data) {
	var self = this;

	self.data = data;

	self.cursor = ko.observable(-1);

	self.children = ko.computed(function () {
		var offset = self.cursor() * self.data.blockSize();
		var count = ko.unwrap(self.data.childCount);

		if (offset < 0 || count == 0) {
			return [];
		}

		var blockSize = self.data.blockSize();
		if (offset + blockSize > count)
		{
			blockSize = count - offset;
		}

		return data.resource.get(offset, blockSize);
	});

	self.top = ko.pureComputed(function () {
		var gridSize = self.data.gridSize();
		var childSize = ko.unwrap(self.data.childSize);

		if (!gridSize || !childSize)
		{
			return -10000;
		}

		return self.cursor() * gridSize.rows * childSize.height;
	});

	self.blockStyle = ko.pureComputed(function () {
		return {
			position: 'absolute',
			top: self.top() + 'px',
			width: '100%',
		};
	});
}

function SuperScroll(data) {

	var self = this;

	self.data = data;

	self.scrollTop = ko.observable(0);

	var poller = new ResizePoller(data);

	var prev = new Block(data);
	var curr = new Block(data);
	var next = new Block(data);

	prev.cursor(-1);
	curr.cursor(0);
	next.cursor(1);

	self.blocks = [
		prev,
		curr,
		next
	];

	self.containerStyle = ko.pureComputed(function () {
		var childSize = ko.unwrap(self.data.childSize);
		var childCount = ko.unwrap(self.data.childCount);
		var gridSize = self.data.gridSize();

		if (childSize == undefined ||
			gridSize == undefined ||
			gridSize.cols == 0 ||
			childCount == 0)
		{
			return {
				width: "100%",
				height: 0,
			};
		}

		var height = Math.ceil(childCount / gridSize.cols) * childSize.height;

		return {
			position: 'relative',
			width: "100%",
			height: height + 'px',
			overflow: 'hidden',
		};
	});

	self.setup = function () {
		var element = $(data.element);
		if (!element)
		{
			console.error("SuperScroll needs to be bound to a container element");
			return;
		}

		self.data.scrollTop.subscribe(function (value) {
			var grid = self.data.gridSize();
			var childSize = ko.unwrap(self.data.childSize);

			if (!grid ||
					!childSize ||
					grid.cols == 0 ||
					childSize.height == 0)
			{
				return;
			}

			var cursor = Math.floor(value / (self.data.gridSize().rows * childSize.height));

			if (cursor < prev.cursor() ||
					cursor > next.cursor())
			{
				prev.cursor(cursor - 1);
				curr.cursor(cursor);
				next.cursor(cursor + 1);
			}
			else if (cursor == prev.cursor())
			{
				var tmp = next;
				next = curr;
				curr = prev;
				prev = tmp;

				prev.cursor(cursor - 1);
			}
			else if (cursor == next.cursor())
			{
				var tmp = prev;
				prev = curr;
				curr = next;
				next = tmp;

				next.cursor(cursor + 1);
			}
		});

		poller.start(element);
	};

	self.dispose = function () {
		poller.stop = true;
		poller = null;
	};
};

function ResizePoller(data) {

	var self = this;

	self.stop = false;

	function poll() {
		var elementSize = data.elementSize();

		if (!elementSize ||
			self.element.width() != elementSize.width ||
			self.element.height() != elementSize.height)
		{
			data.elementSize({
				width: self.element.width(),
				height: self.element.height(),
			});

			data.scrollTop.valueHasMutated();
		}

		if (!self.stop)
		{
			setTimeout(poll, 20);
			return;
		}

		self.element.unbind("scroll");
	};

	self.start = function (element) {
		self.element = element;

		poll();

		self.element.scroll(function () {
			data.scrollTop(self.element.scrollTop());
		});
	};
};

ko.components.register('superScroll', {
	viewModel: {
		createViewModel: function (params, componentInfo) {
			params = ko.unwrap(params);

			var data = new SharedData();
			data.resource = params.resource;
			data.childCount = params.childCount;
			data.childTemplate = params.childTemplate;
			data.childSize = params.childSize;
			data.element = componentInfo.element;

			var superScroll = new SuperScroll(data);
			superScroll.setup();

			return superScroll;
		},
	},
	template: template,
});
