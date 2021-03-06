JS_COMPILER = \
	java -jar /Library/Google/Compiler/compiler-20100616.jar \
	--externs=src/externs.js \
	--warning_level=VERBOSE \
	--charset=UTF-8

SRC_FILES = \
	src/date.js \
	src/object.js \
	src/start.js \
	src/ns.js \
	src/dispatch.js \
	src/ease.js \
	src/interpolate.js \
	src/tween.js \
	src/rgb.js \
	src/transform.js \
	src/transform_add.js \
	src/transform_attr.js \
	src/transform_data.js \
	src/transform_remove.js \
	src/transform_on.js \
	src/transform_filter.js \
	src/transform_select.js \
	src/transform_select_all.js \
	src/transform_style.js \
	src/transform_text.js \
	src/transform_transition.js \
	src/end.js

all: d3.js d3.min.js

d3.min.js: d3.js Makefile src/externs.js
	rm -f $@
	$(JS_COMPILER) --js $< --js_output_file $@

d3.js: $(SRC_FILES) Makefile
	rm -f $@
	cat $(SRC_FILES) >> $@
	chmod a-w $@

clean:
	rm -f d3.js d3.min.js
