import hashlib
import unittest
from contextlib import contextmanager
from urllib.error import URLError
from shared_source_delta import curl_readback
from publish_bundle_thumbnails import key

class SharedCdnResumeTests(unittest.TestCase):
    def fixture(self,n):
        raws={hashlib.sha256(str(i).encode()).hexdigest():str(i).encode() for i in range(n)}
        return list(raws),{key(s):len(v) for s,v in raws.items()},raws

    def test_transient_reconnect_resumes_only_remaining(self):
        pending,expected,raws=self.fixture(3)
        calls=[];delays=[];checkpoints=[]
        @contextmanager
        def factory(scope,objects,*,http1):
            calls.append((list(scope),http1))
            def read(sha,budget):
                if len(calls)==1 and sha==pending[1]:
                    raise URLError("curl exit=1; HTTP/connection result=000 1; curl: (35) Recv failure: Connection reset by peer")
                raw=raws[sha];budget[0]-=len(raw);return raw
            yield read
        verified,errors,count=curl_readback(pending,expected,{},lambda v,e:checkpoints.append(dict(v)),factory,delays.append)
        self.assertEqual(verified,expected)
        self.assertEqual(count,3)
        self.assertFalse(errors)
        self.assertEqual(calls,[(pending,False),(pending[1:],True)])
        self.assertEqual(delays,[2])
        self.assertEqual([len(v) for v in checkpoints],[1,2,3])

    def test_reconnect_is_bounded_and_integrity_errors_never_retry(self):
        pending,expected,raws=self.fixture(2)
        for failure,retries in [
            (URLError("curl exit=1; HTTP/connection result=000 1; curl: (35) reset"),5),
            (URLError("curl exit=22; HTTP/connection result=404 1; curl: (22) not found"),0),
            (URLError("curl exit=60; HTTP/connection result=000 1; curl: (60) certificate"),0),
            (None,0)]:
            with self.subTest(failure=failure):
                calls=[];delays=[]
                @contextmanager
                def factory(scope,objects,*,http1):
                    calls.append(http1)
                    def read(sha,budget):
                        if failure:raise failure
                        return b"incorrect"
                    yield read
                verified,errors,count=curl_readback(pending,expected,{},lambda v,e:None,factory,delays.append)
                self.assertFalse(verified)
                self.assertEqual(count,0)
                self.assertEqual(set(errors),{key(pending[0])})
                self.assertEqual(len(calls),1+retries)
                self.assertEqual(delays,[2,5,10,30,60] if retries else [])

    def test_session_size_bounded(self):
        pending,expected,raws=self.fixture(260)
        sizes=[]
        @contextmanager
        def factory(scope,objects,*,http1):
            sizes.append(len(scope))
            def read(sha,budget):
                raw=raws[sha];budget[0]-=len(raw);return raw
            yield read
        verified,errors,count=curl_readback(pending,expected,{},lambda v,e:None,factory,lambda n:None)
        self.assertEqual(sizes,[128,128,4])
        self.assertEqual(verified,expected)
        self.assertEqual(count,260)
        self.assertFalse(errors)

if __name__=="__main__":unittest.main()
