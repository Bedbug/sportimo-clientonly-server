var gulp = require('gulp');
var exec = require('child_process').exec;


gulp.task('deploy',function(cb){
    exec('modulus deploy -p gameserver_v2', function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
    cb(err);
  });
   
})

gulp.task('logs',function(cb){
    exec('modulus logs tail -p gameserver_v2', function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
    cb(err);
  });
   
})



