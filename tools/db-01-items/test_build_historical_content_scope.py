import unittest
from build_historical_content_scope import mandatory, positive_grants

def v(n):
    out=bytearray()
    while n>127:
        out.append((n&127)|128);n>>=7
    out.append(n)
    return bytes(out)
def integer(n,x):return v(n<<3)+v(x)
def message(n,x):return v((n<<3)|2)+v(len(x))+x
def tree(*leaves,op=0):return (integer(1,op) if op else b'')+b''.join(message(2,x) for x in leaves)
def expansion(inverse=0,name=b'Expansion04'):
    return message(140,message(1,name)+(integer(2,inverse) if inverse else b''))
def common(cid,inverse=0):
    return message(5,integer(1,cid)+(integer(2,inverse) if inverse else b''))

class HistoricalContentScopeTests(unittest.TestCase):
    def test_positive_and_only(self):
        self.assertEqual(mandatory(tree(expansion()),{}),[[[0],[]]])
        self.assertEqual(mandatory(tree(expansion(),op=1),{}),[])
        self.assertEqual(mandatory(tree(expansion(),op=2),{}),[])
        self.assertEqual(mandatory(tree(expansion(inverse=1)),{}),[])
        self.assertEqual(mandatory(tree(expansion(name=b'Expansion03')),{}),[])
        self.assertEqual(mandatory(tree(message(10,tree(expansion()))),{}),[[[0,0],[]]])
        self.assertEqual(mandatory(tree(message(10,tree(expansion(),op=1))),{}),[])
    def test_common_condition_chain_and_cycle(self):
        defs={101:tree(common(102)),102:tree(expansion()),103:tree(common(103))}
        self.assertEqual(mandatory(tree(common(101)),defs),[[[0,0,0],[101,102]]])
        self.assertEqual(mandatory(tree(common(101,inverse=1)),defs),[])
        self.assertEqual(mandatory(tree(common(103)),defs),[])
        self.assertEqual(mandatory(tree(common(999)),defs),[])
    def test_only_positive_typed_grants(self):
        item=integer(1,55)
        give=message(1,item+integer(2,2))+message(1,item+integer(2,(1<<64)-1))
        mail=message(5,message(1,item)+integer(2,3))+message(5,message(1,item+integer(2,9)))
        swap=message(1,item+integer(2,1))+message(2,item+integer(2,4))
        self.assertEqual(list(positive_grants([(23,2,give),(27,2,mail),(35,2,swap)])),
          [(55,2,'conditional_grant'),(55,3,'conditional_mail_attachment'),(55,4,'conditional_swap_grant')])
