/**
 * wx-server-sdk 的内存 mock。
 *
 * 云函数在本机无法连接真实云环境，这里用一个纯内存数据库模拟
 * `cloud.init / cloud.database() / cloud.getWXContext()` 及其集合查询链路，
 * 让 10 个云函数可以脱离云环境独立跑单测。
 *
 * 支持的操作（与云函数实际用到的子集对应）：
 *   collection(name).add({ data })                    → { _id }
 *   collection(name).doc(id).get()                    → { data } 不存在时 throw
 *   collection(name).doc(id).update({ data })          → 合并字段
 *   collection(name).doc(id).remove()                  → 删除
 *   collection(name).where(cond).get() / .count()      → { data } / { total }
 *   .where().orderBy(f, dir).limit(n).get()            → 排序 + 截断
 *   db.command.gt(v) / .in(list)                       → 操作符（支持 $op 匹配）
 *
 * 通过暴露的测试控制 API 注入数据与控制 openid：
 *   __reset / __setOpenid / __seed(name, docs) / __collection(name)
 */

let currentOpenid = 'default-openid';
const collections = {}; // name -> Array<doc>
let idCounter = 0;

function col(name) {
  if (!collections[name]) collections[name] = [];
  return collections[name];
}

function matches(doc, cond) {
  return Object.keys(cond).every((k) => {
    const v = cond[k];
    if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, '$op')) {
      const { $op, value } = v;
      if ($op === 'gt') return doc[k] > value;
      if ($op === 'gte') return doc[k] >= value;
      if ($op === 'lt') return doc[k] < value;
      if ($op === 'in') return Array.isArray(value) && value.includes(doc[k]);
      if ($op === 'neq') return doc[k] !== value;
      return false;
    }
    return doc[k] === v;
  });
}

function makeQuery(name, filter, sort, limitVal) {
  const snapshot = () => {
    let list = col(name).filter((d) => matches(d, filter));
    if (sort.length) {
      const [field, dir] = sort[0];
      list = list.slice().sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        if (typeof av === 'number' && typeof bv === 'number') {
          return dir === 'desc' ? bv - av : av - bv;
        }
        return dir === 'desc'
          ? String(bv).localeCompare(String(av))
          : String(av).localeCompare(String(bv));
      });
    }
    if (limitVal != null) list = list.slice(0, limitVal);
    return list;
  };
  return {
    orderBy(field, dir) { return makeQuery(name, filter, [[field, dir]], limitVal); },
    limit(n) { return makeQuery(name, filter, sort, n); },
    async get() { return { data: snapshot() }; },
    async count() { return { total: snapshot().length }; }
  };
}

function makeDocRef(name, id) {
  return {
    async get() {
      const d = col(name).find((x) => x._id === id);
      if (!d) throw new Error(`doc not found: ${name}/${id}`);
      return { data: d };
    },
    async update({ data }) {
      const d = col(name).find((x) => x._id === id);
      if (!d) throw new Error(`doc not found: ${name}/${id}`);
      Object.assign(d, data);
      return { stats: { updated: 1 } };
    },
    async remove() {
      const idx = col(name).findIndex((x) => x._id === id);
      if (idx === -1) throw new Error(`doc not found: ${name}/${id}`);
      col(name).splice(idx, 1);
      return { stats: { removed: 1 } };
    }
  };
}

const command = {
  gt(value) { return { $op: 'gt', value }; },
  gte(value) { return { $op: 'gte', value }; },
  lt(value) { return { $op: 'lt', value }; },
  in(list) { return { $op: 'in', value: list }; },
  neq(value) { return { $op: 'neq', value }; }
};

const db = {
  command,
  collection(name) {
    return {
      doc(id) { return makeDocRef(name, id); },
      where(filter) { return makeQuery(name, filter, [], null); },
      add({ data }) {
        const _id = `${name}_${++idCounter}`;
        col(name).push({ _id, ...data });
        return { _id };
      }
    };
  },
  async runTransaction(fn) { return fn(this); }
};

const cloud = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  getWXContext() { return { OPENID: currentOpenid }; },
  database() { return db; }
};

// ---- 测试控制 API ----
cloud.__reset = () => {
  Object.keys(collections).forEach((k) => delete collections[k]);
  currentOpenid = 'default-openid';
  idCounter = 0;
};
cloud.__setOpenid = (id) => { currentOpenid = id; };
cloud.__seed = (name, docs) => { col(name).push(...docs); };
cloud.__collection = (name) => col(name);

module.exports = cloud;
