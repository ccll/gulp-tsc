var helper = require('./helper');
var Compiler = require('../lib/compiler');
var tsc = require('../lib/tsc');
var sinon = require('sinon');
var File = require('gulp-util').File;
var fs = require('fs');
var path = require('path');

describe('Compiler', function () {

  beforeEach(function () {
    this.sinon = sinon.sandbox.create();
  });

  afterEach(function () {
    this.sinon.restore();
  });

  describe('#getVersion', function () {
    it('returns the version of tsc', function (done) {
      this.sinon.stub(tsc, 'version').callsArgWith(1, null, '1.2.3');

      var compiler = new Compiler();
      compiler.getVersion(function (err, version) {
        if (err) return done(err);
        version.should.equal('1.2.3');
        done();
      });
    });
  });

  describe('#compile', function () {
    it('executes tsc command', function (done) {
      var proc = helper.createDummyProcess();
      this.sinon.stub(tsc, 'exec', function () {
        proc.terminate(0);
        return proc;
      });

      var compiler = new Compiler();
      compiler.compile(function (err) {
        if (err) return done(err);

        tsc.exec.calledOnce.should.be.true;
        var args = tsc.exec.args[0];
        args[0].should.eql([
          '--module', 'commonjs',
          '--target', 'ES3',
          '--outDir', compiler.tempDestination
        ]);

        done();
      });
    });

    it('removes temporary directory after compilation', function (done) {
      var proc = helper.createDummyProcess();
      this.sinon.stub(tsc, 'exec', function () {
        proc.terminate(0);
        return proc;
      });

      var compiler = new Compiler();
      compiler.compile(function (err) {
        if (err) return done(err);
        fs.existsSync(compiler.tempDestination).should.be.false;
        done();
      });
    });

    it('emits output file as data event', function (done) {
      var _this = this;
      helper.createTemporaryFile({ prefix: 'gulp-tsc', suffix: '.ts' }, function (err, file) {
        if (err) return done(err);

        var proc = helper.createDummyProcess();
        var outputFilePath;
        var outputFileContents = 'test file';
        var fileEmitted = false;
        var compiler = new Compiler([file]);

        _this.sinon.stub(tsc, 'exec', function () {
          process.nextTick(function () {
            outputFilePath = path.join(compiler.tempDestination, 'test.js');
            fs.writeFileSync(outputFilePath, outputFileContents);
            proc.terminate(0);
          });
          return proc;
        });

        compiler.compile(function (err) {
          if (err) return done(err);
          if (!fileEmitted) return done(new Error('No data event emitted'));
          fs.existsSync(outputFilePath).should.be.false;
          done();
        });
        compiler.on('data', function (file) {
          file.path.should.eql(outputFilePath);
          file.contents.toString().should.eql(outputFileContents);
          fileEmitted = true;
        });
      });
    });

    it('bypasses outputs from tsc process as events', function (done) {
      var proc = helper.createDummyProcess();
      this.sinon.stub(tsc, 'exec', function() {
        process.nextTick(function () {
          proc.stdout.write('test stdout1\n');
          proc.stderr.write('test stderr1\n');
          proc.stdout.write('test stdout2\n');
          proc.stderr.write('test stderr2\n');
          proc.terminate(0);
        });
        return proc;
      });

      var stdout = [], stderr = [];

      var compiler = new Compiler();
      compiler.on('stdout', function (line) { stdout.push(line.toString()) });
      compiler.on('stderr', function (line) { stderr.push(line.toString()) });

      compiler.compile(function (err) {
        if (err) return done(err);

        stdout.should.have.length(2);
        stdout.should.eql(['test stdout1', 'test stdout2']);

        stderr.should.have.length(2);
        stderr.should.eql(['test stderr1', 'test stderr2']);

        done();
      });
    });
  });

  describe('.abortAll', function () {
    it('aborts all running compiles', function (done) {
      var procs = [helper.createDummyProcess(), helper.createDummyProcess()];
      this.sinon.stub(tsc, 'exec', function () {
        if (procs.length == 2) {
          abort();
        }
        var proc = procs.shift();
        process.nextTick(function () { proc.terminate(0); });
        return proc;
      });

      var compiler1 = new Compiler(), called1 = false;
      var compiler2 = new Compiler(), called2 = false;

      compiler1.compile(function (err) {
        err.should.be.an.Error;
        err.message.should.eql('aborted');
        called1 = true;
      });
      compiler2.compile(function (err) {
        err.should.be.an.Error;
        err.message.should.eql('aborted');
        called2 = true;
      });

      function abort() {
        Compiler.abortAll(function () {
          process.nextTick(function () {
            called1.should.be.true;
            called2.should.be.true;
            done();
          });
        });
      }
    });
  });

});
