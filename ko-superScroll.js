var template = '\
<script type="text/html" id="super-scroll-template"> \
<!-- ko if: myData.myContext --> \
	<div data-bind="style: myStyle"> \
		<!-- ko foreach: myBlocks --> \
			<div data-bind="style: myStyle"> \
				<!-- ko foreach: myChildren --> \
					<!-- ko if: myChildModel --> \
						<div data-bind="style: myStyle"> \
							<div data-bind="superScrollChild: { template: myTemplate, context: myContext }"></div> \
						</div> \
					<!-- /ko --> \
				<!-- /ko --> \
			</div> \
		<!-- /ko --> \
	</div> \
<!-- /ko --> \
</script>';

$(document).ready(function () {
	$("body").append(template);
});

function ListData(aElement) {
	var self = this;

	self.myElement = aElement;
	self.myContext = ko.observable();
	self.myChildTemplate = ko.observable();
	self.myResource = ko.observable();
	self.myChildSize = ko.observable();
	self.myElementSize = ko.observable();

	self.myChildCount = ko.observable();

	self.myGrid = ko.pureComputed(function() {
		var elementSize = self.myElementSize();
		var childSize = self.myChildSize();
		var childCount = self.myChildCount();

		if (!childSize || !elementSize || !childCount ||
			childSize.myWidth == 0 || 
			childSize.myHeight == 0)
		{
			return undefined;
		}

		var width = elementSize.myWidth;
		var height = elementSize.myHeight;

		var cols = Math.floor(width / childSize.myWidth);
		var rows = Math.ceil(height / childSize.myHeight);

		if (cols == 0) {
			cols = 1;
		}
		if (rows == 0) {
			rows = 1;
		}

		return {
			myCols: cols,
			myRows: rows,
			myWidth: cols*childSize.myWidth,
			myHeight: rows*childSize.myHeight,
		};
	});
}

function ListChild(aData, aX, aY) {
	var self = this;

	self.myData = aData;

	self.myChildModel = ko.observable();
	self.myX = aX;
	self.myY = aY;

	self.myWidth = ko.pureComputed(function() {
		if (!self.myData.myChildSize()) {
			return 0;
		}

		return self.myData.myChildSize().myWidth;
	});

	self.myHeight = ko.pureComputed(function() {
		if (!self.myData.myChildSize()) {
			return 0;
		}

		return self.myData.myChildSize().myHeight;
	});

	self.myStyle = ko.pureComputed(function() {
		return {
			position: "absolute",
			top: self.myY + "px",
			left: self.myX + "px",
			width: self.myWidth() + "px",
			height: self.myHeight() + "px",
		};
	});

	self.myContext = ko.computed(function () {
		var context = self.myData.myContext();
		var childModel = self.myChildModel();

		if (!context || !childModel) {
			return {};
		}

		return context.createChildContext(childModel);
	});

	self.myTemplate = ko.computed(function() {
		if (!self.myData.myChildTemplate()) {
			return "";
		}

		return self.myData.myChildTemplate();
	});
}

function ListBlock(aData, aInitialCursor)
{
	var self = this;

	self.myData = aData;
	self.myCursor = ko.observable(aInitialCursor);

	self.myTop = ko.pureComputed(function () {
		var grid = self.myData.myGrid();
		if (!grid)
		{
			return 0;
		}

		var top = self.myCursor() * grid.myHeight;

		return self.myCursor() * grid.myHeight;
	});

	self.myStyle = ko.pureComputed(function () {
		var grid = self.myData.myGrid();
		if (!grid) {
			return { "display": "none" };
		}

		return {
			"display": "block",
			"position": "absolute",
			"top": self.myTop() + "px",
			"left": "0px",
			"width": grid.myWidth + "px",
			"height": grid.myHeight + "px",
			"overflow": "none",
		};
	});

	self.myInitialized = ko.computed(function() {
		return !!self.myData.myContext();
	});

	self.myChildren = ko.computed(function() {
		var grid = self.myData.myGrid();
		var context = self.myData.myContext();
		var resource = self.myData.myResource();

		if (!grid || !context || !resource || grid.myCols == 0 || grid.myRows == 0) {
			return [];
		}

		if (self.myCursor() < 0) {
			return [];
		}

		var width = grid.myWidth / grid.myCols;
		var height = grid.myHeight / grid.myRows;

		var count = grid.myCols * grid.myRows;
		var children = [];

		for (var row = 0; row < grid.myRows; row++) {
			for (var col = 0; col < grid.myCols; col++) {
				var i = row * grid.myCols + col;
				var child = new ListChild(self.myData, col*width, row*height);
				children.push(child);
			}
		}

		resource.get(self.myCursor() * count, count)
			.done(function (aChildData) {
				for (var i = 0; i < aChildData.length; i++) {
					children[i].myChildModel(aChildData[i]);	
				}
			});

		return children;
	});
}

function ListContainer(aData) {
	var self = this;

	self.myData = aData;

	var prev = new ListBlock(aData, -1);
	var curr = new ListBlock(aData, 0);
	var next = new ListBlock(aData, 1);

	self.myBlocks = [prev, curr, next];

	self.myHeight = ko.pureComputed(function() {
		var grid = self.myData.myGrid();
		var childSize = self.myData.myChildSize();
		var childCount = self.myData.myChildCount();

		if (!grid || !childSize || !childCount || grid.myCols == 0) {
			return 0;
		}

		var rowCount = Math.ceil(childCount / grid.myCols);

		return rowCount * childSize.myHeight;
	});

	self.myStyle = ko.pureComputed(function() {
		return {
			"position": "relative",
			"height": self.myHeight() + "px",
			"width": "100%",
			"overflow": "hidden",
		};
	});

	self.myData.myGrid.subscribe(function (aNewValue) {
		var grid = aNewValue;
		if (!grid || grid.myRows == 0) {
			return;
		}

		$(self.myData.myElement).scroll();
	});

	$(self.myData.myElement).scroll(function () {
		var grid = self.myData.myGrid();
		if (!grid || grid.myHeight == 0) {
			return;
		}

		var top = $(self.myData.myElement).scrollTop();
		var cursor = Math.floor(top / grid.myHeight);

		// The cursor hasn't changed, just remain
		if (cursor == curr.myCursor()) {
			return;
		}

		// The cursor has moved to the next block, shift downwards
		if (cursor == next.myCursor()) {
			var tmp = prev;
			prev = curr;
			curr = next;
			next = tmp;
			next.myCursor(curr.myCursor() + 1);
			return;
		}

		// The cursor has moved to the previous block, shift upwards
		if (cursor == prev.myCursor()) {
			var tmp = next;
			next = curr;
			curr = prev;
			prev = tmp;
			prev.myCursor(curr.myCursor() - 1);
			return;
		}

		// Cursor has moved drastically, reset all blocks
		prev.myCursor(cursor - 1);
		curr.myCursor(cursor);
		next.myCursor(cursor + 1);
	});

	function pollSize() {
		var width = $(self.myData.myElement).width();
		var height = $(self.myData.myElement).height();

		var elementSize = self.myData.myElementSize();
		if (elementSize &&
			elementSize.myWidth == width &&
			elementSize.myHeight == height) {
			setTimeout(pollSize, 50);
			return;
		}

		self.myData.myElementSize({
			myWidth: width,
			myHeight: height,
		});
		setTimeout(pollSize, 50);
	};

	pollSize();
}

function SuperScroll() {
	var self = this;

	self.myContainers = {};

	self.init = function(aElement, aValueAccessor, aAllBindings, aViewModel, aBindingsContext) {
		var listData = new ListData(aElement);
		var listContainer = new ListContainer(listData);

		self.myContainers[aElement] = listContainer;

		var context = aBindingsContext.createChildContext(listContainer);
		ko.renderTemplate("super-scroll-template", context, {}, aElement);

		return { controlsDescendantBindings: true };
	};
	self.update = function(aElement, aValueAccessor, aAllBindings, aViewModel, aBindingsContext) {
		var value = ko.unwrap(aValueAccessor());
		var template = ko.unwrap(value.template);
		var resource = ko.unwrap(value.resource);
		var childSize = ko.unwrap(value.childSize);

		var container = self.myContainers[aElement];

		container.myData.myChildTemplate(template);
		container.myData.myResource(resource);
		container.myData.myContext(aBindingsContext);
		container.myData.myChildSize(childSize);

		resource.getCount()
			.done(function (aCount) {
				container.myData.myChildCount(aCount);
			});
	};
}

function SuperScrollChild() {
	var self = this;

	self.update = function(aElement, aValueAccessor, aAllBindings, aViewModel, aBindingsContext) {
		var value = ko.unwrap(aValueAccessor());
		var template = ko.unwrap(value.template);
		var context = ko.unwrap(value.context);

		ko.renderTemplate(template, context, {}, aElement, "replaceNode");
	};
}

ko.bindingHandlers.superScroll = new SuperScroll();
ko.bindingHandlers.superScrollChild = new SuperScrollChild();