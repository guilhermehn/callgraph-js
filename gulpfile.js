var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();

gulp.task('js', function () {
  gulp
    .src('index.js')
    //.pipe(plugins.jshint())
    //.pipe(plugins.jscs())
    .pipe(plugins.sourcemaps.init())
    .pipe(plugins.babel())
    .pipe(plugins.sourcemaps.write())
    .pipe(gulp.dest('dist/'))
    .pipe(plugins.livereload());
});

gulp.task('watch', function () {
  plugins.livereload.listen();

  gulp.watch('index.js', ['js']);
});
