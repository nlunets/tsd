///<reference path="../_ref.ts" />
///<reference path="../xm/KeyValueMap.ts" />
///<reference path="../xm/StatCounter.ts" />
///<reference path="../xm/assertVar.ts" />
///<reference path="../xm/io/hash.ts" />
///<reference path="../xm/io/Logger.ts" />
///<reference path="../xm/io/FileUtil.ts" />
///<reference path="GithubAPICachedJSONStore.ts" />
///<reference path="GithubAPICachedResult.ts" />
///<reference path="GithubRepo.ts" />

module git {

	var async:Async = require('async');
	var _:UnderscoreStatic = require('underscore');
	var Q:QStatic = require('q');
	var assert = require('assert');
	var fs = require('fs');
	var path = require('path');

	var Github = require('github');

	//move to a .d.ts?
	export interface GithubJS {
		repos:git.GithubJSRepos;
		data:git.GithubJSData;
	}
	export interface GithubJSRepos {
		getBranches(params:any, calback:git.GithubJSCallback);
		getBranch(params:any, calback:git.GithubJSCallback);
		getCommits(params:any, calback:git.GithubJSCallback);
	}
	export interface GithubJSData {
		getCommit(params:any, calback:git.GithubJSCallback);
		getTree(params:any, calback:git.GithubJSCallback);
		getBlob(params:any, calback:git.GithubJSCallback);
	}
	export interface GithubJSCallback {
		(err?:any, res?:any):void;
	}

	/*
	 GithubAPICached: access github rest api with local cache (evading rate-limit)
	 */
	//TODO implement http://developer.github.com/v3/#conditional-requests (add last-mod + etag to json store)
	//TODO find out if a HEAD requests counts for rate-limiting
	export class GithubAPICached {

		private _api:git.GithubJS;
		private _repo:GithubRepo;
		private _store:GithubAPICachedJSONStore;
		private _apiVersion:string = '3.0.0';
		private _defaultOpts:any = {};

		private _debug:bool = false;

		stats = new xm.StatCounter(false);
		rate:GitRateLimitInfo;

		constructor(repo:GithubRepo, storeFolder:string) {
			xm.assertVar('repo', repo, GithubRepo);
			xm.assertVar('storeFolder', storeFolder, 'string');

			this._repo = repo;
			this._api = <git.GithubJS> new Github({
				version: this._apiVersion
			});

			this._store = new git.GithubAPICachedJSONStore(this, storeFolder);
			this.rate = new GitRateLimitInfo();
		}

		getRepoParams(vars:any):any {
			return _.defaults(vars, {
				user: this._repo.ownerName,
				repo: this._repo.projectName
			});
		}

		getCachedRaw(key:string):Qpromise {
			return this._store.getResult(key);
		}

		getKey(label:string, keyTerms?:any):string {
			return xm.jsonToIdent([label, keyTerms ? keyTerms : {}]);
		}

		getBranches():Qpromise {
			var params = this.getRepoParams({});
			return this.doCachedCall('getBranches', params, {}, (cb) => {
				this._api.repos.getBranches(params, cb);
			});
		}

		getBranch(branch:string):Qpromise {
			var params = this.getRepoParams({
				branch: branch
			});
			return this.doCachedCall('getBranch', params, {}, (cb) => {
				this._api.repos.getBranch(params, cb);
			});
		}

		getTree(sha:string, recursive:bool):Qpromise {
			var params = this.getRepoParams({
				sha: sha,
				recursive: recursive
			});
			return this.doCachedCall('getTree', params, {}, (cb) => {
				this._api.data.getTree(params, cb);
			});
		}

		getCommit(sha:string):Qpromise {
			var params = this.getRepoParams({
				sha: sha
			});
			return this.doCachedCall('getCommit', params, {}, (cb) => {
				this._api.data.getCommit(params, cb);
			});
		}

		getBlob(sha:string):Qpromise {
			var params = this.getRepoParams({
				sha: sha,
				per_page: 100
			});
			return this.doCachedCall('getBlob', params, {}, (cb) => {
				this._api.data.getBlob(params, cb);
			});
		}

		getCommits(sha:string):Qpromise {
			//TODO support auto pagination
			var params = this.getRepoParams({
				per_page: 100,
				sha: sha
			});
			return this.doCachedCall('getCommits', params, {}, (cb) => {
				this._api.repos.getCommits(params, cb);
			});
		}

		getPathCommits(sha:string, path:String):Qpromise {
			//TODO support auto pagination
			var params = this.getRepoParams({
				per_page: 100,
				sha: sha,
				path: path
			});
			return this.doCachedCall('getCommits', params, {}, (cb) => {
				this._api.repos.getCommits(params, cb);
			});
		}

		//TODO promise-ify this further
		//TODO harden against race conditions?
		private doCachedCall(label:string, keyTerms:any, opts:any, call:Function):Qpromise {
			var key = this.getKey(label, keyTerms);

			opts = _.defaults(opts || {}, this._defaultOpts);

			this.stats.count('invoked');

			var defer = Q.defer();

			// subroutine
			var execCall = () => {
				this.stats.count('call-api');

				// classic callback
				call.call(null, (err, res:any) => {
					this.rate.readFromRes(res);
					if (this._debug) {
						xm.log(this.rate.toStatus());
					}

					if (err) {
						this.stats.count('call-error');
						defer.reject(err);
						return;
					}
					this.stats.count('call-success');

					var cached = new git.GithubAPICachedResult(label, key, res);

					// permanent storage?
					this._store.storeResult(cached).then((info) => {
						if (err) {
							this.stats.count('store-set-error');
							defer.reject(err);
						}
						else {
							this.stats.count('store-set');
							defer.resolve(res);
						}
					});
				});
			};

			// in permanent store?
			this._store.getResult(key).then((res:GithubAPICachedResult) => {
				if (res) {
					this.stats.count('store-hit');
					defer.resolve(res.data);
				}
				else {
					this.stats.count('store-miss');
					execCall();
				}
			}, (err) => {
				this.stats.count('store-get-error');
				defer.reject(err);
			});
			return defer.promise;
		}

		get debug():bool {
			return this._debug;
		}

		set debug(value:bool) {
			this._debug = value;
			this.stats.log = value;
		}

		getCacheKey():string {
			return this._repo.getCacheKey() + '-api' + this._apiVersion;
		}
	}

	export class GitRateLimitInfo {

		limit:number = 0;
		remaining:number = 0;
		lastUpdate:Date = new Date();

		constructor() {

		}

		readFromRes(response:any) {
			if (response && _.isObject(response.meta)) {
				if (response.meta.hasOwnProperty('x-ratelimit-limit')) {
					this.limit = parseInt(response.meta['x-ratelimit-limit'], 10);
				}
				if (response.meta.hasOwnProperty('x-ratelimit-remaining')) {
					this.remaining = parseInt(response.meta['x-ratelimit-remaining'], 10);
				}
				this.lastUpdate = new Date();
			}
		}

		toStatus():string {
			return 'rate limit: ' + this.remaining + ' of ' + this.limit + ' @ ' + this.lastUpdate.toLocaleString();
		}

		hasRemaining():bool {
			return this.remaining > 0;
		}
	}
}