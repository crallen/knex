const Promise = require('bluebird');
const Transaction = require('../../transaction');
const { isUndefined } = require('lodash');
const debugTx = require('debug')('knex:tx');

module.exports = class Oracle_Transaction extends Transaction {
  // disable autocommit to allow correct behavior (default is true)
  begin() {
    return Promise.resolve();
  }

  commit(conn, value) {
    this._completed = true;
    return conn
      .commitAsync()
      .return(value)
      .then(this._resolver, this._rejecter);
  }

  release(conn, value) {
    return this._resolver(value);
  }

  rollback(conn, err) {
    this._completed = true;
    debugTx('%s: rolling back', this.txid);
    return conn
      .rollbackAsync()
      .throw(err)
      .catch((error) => {
        if (isUndefined(error)) {
          error = new Error(`Transaction rejected with non-error: ${error}`);
        }

        return this._rejecter(error);
      });
  }

  acquireConnection(config) {
    const t = this;
    return new Promise((resolve, reject) => {
      try {
        resolve(config.connection || t.client.acquireConnection());
      } catch (e) {
        reject(e);
      }
    })
      .then((connection) => {
        connection.__knexTxId = this.txid;

        return connection;
      })
      .tap((connection) => {
        if (!t.outerTx) {
          connection.setAutoCommit(false);
        }
      })
      .disposer((connection) => {
        debugTx('%s: releasing connection', t.txid);
        connection.setAutoCommit(true);
        if (!config.connection) {
          t.client.releaseConnection(connection);
        } else {
          debugTx('%s: not releasing external connection', t.txid);
        }
      });
  }
};
