var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();

gulp.task('js', function () {
  gulp
    .src('*.js')
    //.pipe(plugins.jshint())
    //.pipe(plugins.jscs())
    //.pipe(plugins.babel())
    //.pipe(gulp.dest('dist/'))
    .pipe(plugins.livereload());
});

gulp.task('watch', function () {
  plugins.livereload.listen();

  gulp.watch('*.js', ['js']);
});
